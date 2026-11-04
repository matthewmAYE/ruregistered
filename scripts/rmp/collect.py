#!/usr/bin/env python3
"""Private-use collector for RateMyProfessors data for one school (default: Rutgers New Brunswick).

Stdlib only. Stores everything in a local SQLite file so runs are resumable.

Usage:
    python scripts/rmp/collect.py professors            # list every professor at the school
    python scripts/rmp/collect.py ratings --limit 200   # fetch reviews, most-reviewed professors first
    python scripts/rmp/collect.py export --out data/rmp  # write professors.csv and ratings.csv

Notes:
- RateMyProfessors' robots.txt asks for a 10 second crawl delay and its terms of use prohibit
  automated access. The default delay below honours the crawl delay; this tool is for private
  use only and the collected data must not be shared or republished.
- On HTTP 403 or 429 the collector stops. It does not rotate IPs, spoof browsers or retry around blocks.
"""
import argparse
import base64
import csv
import json
import sqlite3
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

GRAPHQL_URL = "https://www.ratemyprofessors.com/graphql"
# Public client token that the RMP web app itself sends with every GraphQL request.
AUTH_HEADER = "Basic dGVzdDp0ZXN0"
USER_AGENT = "ruregistered-private-research/0.1 (personal use; contact: repo owner)"
DEFAULT_SCHOOL_LEGACY_ID = 825  # Rutgers University - New Brunswick
DEFAULT_DELAY = 10.0

TEACHER_SEARCH_QUERY = """
query TeacherSearch($query: TeacherSearchQuery!, $first: Int!, $after: String) {
  newSearch {
    teachers(query: $query, first: $first, after: $after) {
      resultCount
      pageInfo { hasNextPage endCursor }
      edges {
        node {
          id legacyId firstName lastName department
          avgRating avgDifficulty wouldTakeAgainPercent numRatings
          school { id legacyId name }
        }
      }
    }
  }
}
"""

TEACHER_RATINGS_QUERY = """
query TeacherRatings($id: ID!, $first: Int!, $after: String) {
  node(id: $id) {
    ... on Teacher {
      id
      ratings(first: $first, after: $after) {
        pageInfo { hasNextPage endCursor }
        edges {
          node {
            id legacyId date class comment
            helpfulRating clarityRating difficultyRating
            wouldTakeAgain grade attendanceMandatory isForCredit isForOnlineClass
            textbookUse ratingTags thumbsUpTotal thumbsDownTotal
          }
        }
      }
    }
  }
}
"""

SCHEMA = """
CREATE TABLE IF NOT EXISTS professors (
    id TEXT PRIMARY KEY,
    legacy_id INTEGER,
    first_name TEXT,
    last_name TEXT,
    department TEXT,
    avg_rating REAL,
    avg_difficulty REAL,
    would_take_again_percent REAL,
    num_ratings INTEGER,
    school_id TEXT,
    school_name TEXT,
    ratings_fetched INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS ratings (
    id TEXT PRIMARY KEY,
    professor_id TEXT NOT NULL REFERENCES professors(id),
    legacy_id INTEGER,
    date TEXT,
    course TEXT,
    comment TEXT,
    helpful_rating REAL,
    clarity_rating REAL,
    difficulty_rating REAL,
    would_take_again INTEGER,
    grade TEXT,
    attendance_mandatory TEXT,
    is_for_credit INTEGER,
    is_online INTEGER,
    textbook_use INTEGER,
    tags TEXT,
    thumbs_up INTEGER,
    thumbs_down INTEGER
);
CREATE TABLE IF NOT EXISTS cursors (
    key TEXT PRIMARY KEY,
    value TEXT
);
"""


class Blocked(RuntimeError):
    """Raised when the server answers 403/429; the run stops instead of working around it."""


def school_global_id(legacy_id):
    return base64.b64encode(f"School-{legacy_id}".encode()).decode()


def http_post(payload, timeout=30):
    req = urllib.request.Request(
        GRAPHQL_URL,
        data=json.dumps(payload).encode(),
        headers={
            "Content-Type": "application/json",
            "Authorization": AUTH_HEADER,
            "User-Agent": USER_AGENT,
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read().decode())
    except urllib.error.HTTPError as err:
        if err.code in (403, 429):
            raise Blocked(f"HTTP {err.code} from RateMyProfessors; stopping.") from err
        raise


class Client:
    """Rate-limited GraphQL client. `transport` is injectable so tests never hit the network."""

    def __init__(self, delay=DEFAULT_DELAY, transport=http_post, sleep=time.sleep, retries=3):
        self.delay = delay
        self.transport = transport
        self.sleep = sleep
        self.retries = retries
        self._last = None

    def execute(self, query, variables):
        for attempt in range(self.retries + 1):
            self._wait()
            try:
                data = self.transport({"query": query, "variables": variables})
            except Blocked:
                raise
            except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, urllib.error.HTTPError) as err:
                if attempt == self.retries:
                    raise
                print(f"  transient error ({err}); retry {attempt + 1}/{self.retries}", file=sys.stderr)
                self.sleep(self.delay * (2 ** attempt))
                continue
            if data.get("errors"):
                raise RuntimeError(f"GraphQL errors: {data['errors']}")
            return data["data"]

    def _wait(self):
        now = time.monotonic()
        if self._last is not None:
            remaining = self.delay - (now - self._last)
            if remaining > 0:
                self.sleep(remaining)
        self._last = time.monotonic()


def connect(db_path):
    Path(db_path).parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(db_path)
    conn.executescript(SCHEMA)
    return conn


def collect_professors(client, conn, school_legacy_id, page_size=100, text=""):
    """Page through the school's teacher search, saving the cursor after each page."""
    key = f"professors:{school_legacy_id}:{text}"
    row = conn.execute("SELECT value FROM cursors WHERE key = ?", (key,)).fetchone()
    after = row[0] if row and row[0] else None
    total = 0
    while True:
        data = client.execute(
            TEACHER_SEARCH_QUERY,
            {
                "query": {"text": text, "schoolID": school_global_id(school_legacy_id)},
                "first": page_size,
                "after": after,
            },
        )
        teachers = data["newSearch"]["teachers"]
        for edge in teachers["edges"]:
            save_professor(conn, edge["node"])
        total += len(teachers["edges"])
        page = teachers["pageInfo"]
        after = page["endCursor"] if page["hasNextPage"] else None
        conn.execute(
            "INSERT OR REPLACE INTO cursors (key, value) VALUES (?, ?)", (key, after or "")
        )
        conn.commit()
        print(f"  saved {total} professors (of ~{teachers.get('resultCount')})")
        if not page["hasNextPage"]:
            return total


def save_professor(conn, node):
    school = node.get("school") or {}
    conn.execute(
        """INSERT INTO professors (id, legacy_id, first_name, last_name, department, avg_rating,
               avg_difficulty, would_take_again_percent, num_ratings, school_id, school_name)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
               avg_rating = excluded.avg_rating,
               avg_difficulty = excluded.avg_difficulty,
               would_take_again_percent = excluded.would_take_again_percent,
               num_ratings = excluded.num_ratings""",
        (
            node["id"], node.get("legacyId"), node.get("firstName"), node.get("lastName"),
            node.get("department"), node.get("avgRating"), node.get("avgDifficulty"),
            node.get("wouldTakeAgainPercent"), node.get("numRatings"),
            school.get("id"), school.get("name"),
        ),
    )


def collect_ratings(client, conn, limit=None, page_size=20):
    """Fetch reviews for professors not yet done, most-reviewed first."""
    sql = (
        "SELECT id, last_name, num_ratings FROM professors "
        "WHERE ratings_fetched = 0 AND num_ratings > 0 ORDER BY num_ratings DESC"
    )
    pending = conn.execute(sql + (f" LIMIT {int(limit)}" if limit else "")).fetchall()
    for index, (prof_id, last_name, num_ratings) in enumerate(pending, 1):
        after = None
        saved = 0
        while True:
            data = client.execute(
                TEACHER_RATINGS_QUERY, {"id": prof_id, "first": page_size, "after": after}
            )
            ratings = data["node"]["ratings"]
            for edge in ratings["edges"]:
                save_rating(conn, prof_id, edge["node"])
            saved += len(ratings["edges"])
            if not ratings["pageInfo"]["hasNextPage"]:
                break
            after = ratings["pageInfo"]["endCursor"]
        conn.execute("UPDATE professors SET ratings_fetched = 1 WHERE id = ?", (prof_id,))
        conn.commit()
        print(f"  [{index}/{len(pending)}] {last_name}: {saved}/{num_ratings} ratings")
    return len(pending)


def save_rating(conn, prof_id, node):
    conn.execute(
        """INSERT OR REPLACE INTO ratings (id, professor_id, legacy_id, date, course, comment,
               helpful_rating, clarity_rating, difficulty_rating, would_take_again, grade,
               attendance_mandatory, is_for_credit, is_online, textbook_use, tags,
               thumbs_up, thumbs_down)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (
            node["id"], prof_id, node.get("legacyId"), node.get("date"), node.get("class"),
            node.get("comment"), node.get("helpfulRating"), node.get("clarityRating"),
            node.get("difficultyRating"), node.get("wouldTakeAgain"), node.get("grade"),
            node.get("attendanceMandatory"), node.get("isForCredit"), node.get("isForOnlineClass"),
            node.get("textbookUse"), node.get("ratingTags"), node.get("thumbsUpTotal"),
            node.get("thumbsDownTotal"),
        ),
    )


def export_csv(conn, out_dir):
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    queries = {
        "professors": (
            "SELECT p.*, (SELECT COUNT(*) FROM ratings r WHERE r.professor_id = p.id) "
            "AS ratings_collected FROM professors p"
        ),
        "ratings": "SELECT * FROM ratings",
    }
    for table, query in queries.items():
        cursor = conn.execute(query)
        with open(out / f"{table}.csv", "w", newline="", encoding="utf-8") as handle:
            writer = csv.writer(handle)
            writer.writerow(col[0] for col in cursor.description)
            writer.writerows(cursor)
        print(f"  wrote {out / (table + '.csv')}")


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("command", choices=["professors", "ratings", "export"])
    parser.add_argument("--db", default="data/rmp/rmp.sqlite")
    parser.add_argument("--school", type=int, default=DEFAULT_SCHOOL_LEGACY_ID,
                        help="RMP legacy school id (825 = Rutgers New Brunswick)")
    parser.add_argument("--delay", type=float, default=DEFAULT_DELAY,
                        help="seconds between requests (robots.txt crawl-delay is 10)")
    parser.add_argument("--limit", type=int, help="ratings: max professors to process this run")
    parser.add_argument("--text", default="", help="professors: optional name filter, e.g. a letter")
    parser.add_argument("--out", default="data/rmp", help="export: output directory")
    args = parser.parse_args(argv)

    conn = connect(args.db)
    client = Client(delay=args.delay)
    try:
        if args.command == "professors":
            collect_professors(client, conn, args.school, text=args.text)
        elif args.command == "ratings":
            collect_ratings(client, conn, limit=args.limit)
        else:
            export_csv(conn, args.out)
    except Blocked as err:
        print(f"\n{err} Progress is saved; do not retry for a while.", file=sys.stderr)
        return 2
    except KeyboardInterrupt:
        print("\nInterrupted; progress is saved.", file=sys.stderr)
        return 130
    finally:
        conn.commit()
        conn.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
