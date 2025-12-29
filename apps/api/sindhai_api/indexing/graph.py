from __future__ import annotations

from dataclasses import dataclass

from neo4j import GraphDatabase


@dataclass(frozen=True)
class GraphNote:
    id: str
    title: str
    path: str
    updated_at: str
    tags: list[str]
    content_hash: str


class Neo4jGraph:
    def __init__(self, uri: str | None, username: str | None, password: str | None) -> None:
        self._driver = None
        if uri and username and password:
            self._driver = GraphDatabase.driver(uri, auth=(username, password))

    def enabled(self) -> bool:
        return self._driver is not None

    def close(self) -> None:
        if self._driver:
            self._driver.close()

    def init_schema(self) -> None:
        if not self._driver:
            return
        with self._driver.session() as session:
            session.run("CREATE CONSTRAINT note_id IF NOT EXISTS FOR (n:Note) REQUIRE n.id IS UNIQUE")

    def note_content_hash(self, note_id: str) -> str | None:
        if not self._driver:
            return None
        with self._driver.session() as session:
            res = session.run(
                "MATCH (n:Note {id: $id}) RETURN n.content_hash AS content_hash",
                id=note_id,
            ).single()
            if not res:
                return None
            return res.get("content_hash")

    def upsert_note(self, note: GraphNote, *, parse_error: str | None, update_tags: bool) -> None:
        if not self._driver:
            return
        self.init_schema()
        with self._driver.session() as session:
            session.execute_write(self._upsert_note_tx, note, parse_error, update_tags)

    @staticmethod
    def _upsert_note_tx(tx, note: GraphNote, parse_error: str | None, update_tags: bool) -> None:
        if update_tags:
            tx.run(
                """
                MERGE (n:Note {id: $id})
                SET n.title = $title,
                    n.path = $path,
                    n.updated_at = $updated_at,
                    n.tags = $tags,
                    n.content_hash = $content_hash,
                    n.parse_error = $parse_error
                """,
                id=note.id,
                title=note.title,
                path=note.path,
                updated_at=note.updated_at,
                tags=note.tags,
                content_hash=note.content_hash,
                parse_error=parse_error,
            )
        else:
            tx.run(
                """
                MERGE (n:Note {id: $id})
                SET n.title = $title,
                    n.path = $path,
                    n.updated_at = $updated_at,
                    n.content_hash = $content_hash,
                    n.parse_error = $parse_error
                """,
                id=note.id,
                title=note.title,
                path=note.path,
                updated_at=note.updated_at,
                content_hash=note.content_hash,
                parse_error=parse_error,
            )

    def replace_outgoing_links(self, note_id: str, targets: list[GraphNote]) -> None:
        if not self._driver:
            return
        self.init_schema()
        with self._driver.session() as session:
            session.execute_write(self._replace_outgoing_links_tx, note_id, targets)

    @staticmethod
    def _replace_outgoing_links_tx(tx, note_id: str, targets: list[GraphNote]) -> None:
        tx.run("MATCH (n:Note {id: $id})-[r:LINKS_TO]->() DELETE r", id=note_id)

        if not targets:
            return

        tx.run(
            """
            UNWIND $targets AS t
            MERGE (m:Note {id: t.id})
            SET m.title = COALESCE(t.title, m.title),
                m.path = COALESCE(t.path, m.path),
                m.updated_at = COALESCE(t.updated_at, m.updated_at),
                m.tags = COALESCE(t.tags, m.tags),
                m.content_hash = COALESCE(t.content_hash, m.content_hash)
            """,
            targets=[
                {
                    "id": t.id,
                    "title": t.title,
                    "path": t.path,
                    "updated_at": t.updated_at,
                    "tags": t.tags,
                    "content_hash": t.content_hash,
                }
                for t in targets
            ],
        )

        tx.run(
            """
            UNWIND $target_ids AS tid
            MATCH (src:Note {id: $src_id})
            MATCH (dst:Note {id: tid})
            MERGE (src)-[:LINKS_TO]->(dst)
            """,
            src_id=note_id,
            target_ids=[t.id for t in targets],
        )

    def upsert_note_and_links(self, note: GraphNote, targets: list[GraphNote]) -> None:
        self.upsert_note(note, parse_error=None, update_tags=True)
        self.replace_outgoing_links(note.id, targets)

    def delete_note(self, note_id: str) -> None:
        if not self._driver:
            return
        with self._driver.session() as session:
            session.execute_write(
                lambda tx: tx.run("MATCH (n:Note {id: $id}) DETACH DELETE n", id=note_id)
            )

    def backlinks(self, note_id: str) -> list[dict]:
        if not self._driver:
            return []
        with self._driver.session() as session:
            res = session.run(
                """
                MATCH (src:Note)-[:LINKS_TO]->(dst:Note {id: $id})
                RETURN src
                ORDER BY src.updated_at DESC
                """,
                id=note_id,
            )
            return [r["src"] for r in res]

    def local_graph(self, note_id: str) -> tuple[list[dict], list[dict]]:
        if not self._driver:
            return ([], [])
        with self._driver.session() as session:
            res = session.run(
                """
                MATCH (n:Note {id: $id})
                OPTIONAL MATCH (n)-[:LINKS_TO]->(o:Note)
                OPTIONAL MATCH (i:Note)-[:LINKS_TO]->(n)
                RETURN n, collect(DISTINCT o) AS outgoing, collect(DISTINCT i) AS incoming
                """,
                id=note_id,
            ).single()
            if not res:
                return ([], [])
            n = res["n"]
            outgoing = [x for x in res["outgoing"] if x]
            incoming = [x for x in res["incoming"] if x]

        nodes_by_id: dict[str, dict] = {}
        for node in [n, *outgoing, *incoming]:
            nodes_by_id[node["id"]] = {"id": node["id"], "title": node.get("title"), "tags": node.get("tags", [])}

        edges: list[dict] = []
        for o in outgoing:
            edges.append({"source": n["id"], "target": o["id"], "type": "LINKS_TO"})
        for i in incoming:
            edges.append({"source": i["id"], "target": n["id"], "type": "LINKS_TO"})

        return (list(nodes_by_id.values()), edges)
