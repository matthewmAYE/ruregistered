import sqlite3
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts" / "rmp"))
import collect  # noqa: E402


def teacher(i, n_ratings):
    return {
        "id": f"VGVhY2hlci0{i}", "legacyId": i, "firstName": f"F{i}", "lastName": f"L{i}",
        "department": "Computer Science", "avgRating": 4.0, "avgDifficulty": 3.0,
        "wouldTakeAgainPercent": 80.0, "numRatings": n_ratings,
        "school": {"id": collect.school_global_id(825), "legacyId": 825, "name": "Rutgers University - New Brunswick"},
    }


def rating(i):
    return {
        "id": f"R{i}", "legacyId": i, "date": "2024-01-01 00:00:00 +0000 UTC", "class": "CS111",
        "comment": "Great", "helpfulRating": 5, "clarityRating": 5, "difficultyRating": 2,
        "wouldTakeAgain": 1, "grade": "A", "attendanceMandatory": "mandatory", "isForCredit": True,
        "isForOnlineClass": False, "textbookUse": 1, "ratingTags": "Caring--Hilarious",
        "thumbsUpTotal": 1, "thumbsDownTotal": 0,
    }


class FakeTransport:
    """Serves two pages of teachers and two pages of ratings per teacher."""

    def __init__(self):
        self.calls = []

    def __call__(self, payload):
        self.calls.append(payload)
        variables = payload["variables"]
        if "newSearch" in payload["query"]:
            assert variables["query"]["schoolID"] == "U2Nob29sLTgyNQ=="
            if variables["after"] is None:
                edges = [teacher(1, 3), teacher(2, 0)]
                page = {"hasNextPage": True, "endCursor": "c1"}
            else:
                edges = [teacher(3, 1)]
                page = {"hasNextPage": False, "endCursor": "c2"}
            return {"data": {"newSearch": {"teachers": {
                "resultCount": 3, "pageInfo": page, "edges": [{"node": n} for n in edges]}}}}
        base = 0 if variables["after"] is None else 10
        more = variables["after"] is None and variables["id"].endswith("1")
        edges = [{"node": rating(base + k + hash(variables["id"]) % 1000 * 100)} for k in range(2 if more else 1)]
        return {"data": {"node": {"id": variables["id"], "ratings": {
            "pageInfo": {"hasNextPage": more, "endCursor": "r1"}, "edges": edges}}}}


class CollectTests(unittest.TestCase):
    def setUp(self):
        self.conn = sqlite3.connect(":memory:")
        self.conn.executescript(collect.SCHEMA)
        self.sleeps = []
        self.transport = FakeTransport()
        self.client = collect.Client(delay=10, transport=self.transport, sleep=self.sleeps.append)

    def test_school_id_encoding(self):
        self.assertEqual(collect.school_global_id(825), "U2Nob29sLTgyNQ==")

    def test_professors_paginate_and_resume_cursor(self):
        total = collect.collect_professors(self.client, self.conn, 825, page_size=2)
        self.assertEqual(total, 3)
        self.assertEqual(self.conn.execute("SELECT COUNT(*) FROM professors").fetchone()[0], 3)
        saved = self.conn.execute("SELECT value FROM cursors").fetchone()[0]
        self.assertEqual(saved, "")  # finished: empty cursor means start over next run

    def test_ratings_skip_unrated_and_mark_done(self):
        collect.collect_professors(self.client, self.conn, 825, page_size=2)
        done = collect.collect_ratings(self.client, self.conn)
        self.assertEqual(done, 2)  # professor with 0 ratings is skipped
        fetched = self.conn.execute("SELECT COUNT(*) FROM professors WHERE ratings_fetched = 1").fetchone()[0]
        self.assertEqual(fetched, 2)
        self.assertEqual(collect.collect_ratings(self.client, self.conn), 0)  # nothing left

    def test_requests_are_spaced_by_delay(self):
        collect.collect_professors(self.client, self.conn, 825, page_size=2)
        self.assertTrue(self.sleeps)
        self.assertTrue(all(0 < s <= 10 for s in self.sleeps))

    def test_block_stops_run_without_retry(self):
        def blocked(_payload):
            raise collect.Blocked("HTTP 429")
        client = collect.Client(delay=0, transport=blocked, sleep=lambda s: None)
        with self.assertRaises(collect.Blocked):
            collect.collect_professors(client, self.conn, 825)


if __name__ == "__main__":
    unittest.main()
