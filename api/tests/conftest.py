import gzip
import json
import sqlite3

import httpx
import pytest
from fastapi.testclient import TestClient

from ruregistered_api.config import Settings
from ruregistered_api.main import create_app
from ruregistered_api.soc import SocClient

SCHEMA = """
CREATE TABLE professors (id TEXT PRIMARY KEY, legacy_id INTEGER, first_name TEXT, last_name TEXT,
  department TEXT, avg_rating REAL, avg_difficulty REAL, would_take_again_percent REAL,
  num_ratings INTEGER, school_id TEXT, school_name TEXT, ratings_fetched INTEGER);
CREATE TABLE ratings (id TEXT PRIMARY KEY, professor_id TEXT, legacy_id INTEGER, date TEXT,
  course TEXT, comment TEXT, helpful_rating REAL, clarity_rating REAL, difficulty_rating REAL,
  would_take_again INTEGER, grade TEXT, attendance_mandatory TEXT, is_for_credit INTEGER,
  is_online INTEGER, textbook_use INTEGER, tags TEXT, thumbs_up INTEGER, thumbs_down INTEGER);
"""


def section(index, number, instructors, day="M", open_=True):
    return {
        "index": index, "number": number, "openStatus": open_, "openStatusText": "OPEN" if open_ else "CLOSED",
        "instructors": [{"name": n} for n in instructors], "instructorsText": "; ".join(instructors),
        "meetingTimes": [{"meetingDay": day, "startTimeMilitary": "1550", "endTimeMilitary": "1710",
                          "meetingModeDesc": "LEC", "campusName": "BUSCH", "campusAbbrev": "BUS",
                          "buildingCode": "HLL", "roomNumber": "114"}],
        "sectionCampusLocations": [{"code": "2", "description": "Busch"}],
        "sectionCourseType": "T", "examCodeText": "During class hour",
        "crossListedSectionsText": "", "majors": [], "minors": [],
    }


def course(string, title, subject, number, sections, **extra):
    c = {"courseString": string, "title": title, "expandedTitle": title, "subject": subject,
         "subjectDescription": extra.pop("subject_description", "COMPUTER SCIENCE"),
         "courseNumber": number, "credits": 4, "level": "U",
         "school": {"code": "01", "description": "School of Arts and Sciences"},
         "coreCodes": extra.pop("core", []), "campusLocations": [{"code": "2", "description": "Busch"}],
         "preReqNotes": "", "courseDescription": "", "sections": sections}
    c.update(extra)
    return c


COURSES = [
    course("01:198:111", "INTRO COMPUTER SCI", "198", "111", [
        section("00001", "01", ["SMITH, JOHN A"]),
        section("00002", "02", ["DOE, JANE", "PATEL, R"], day="T", open_=False),
    ]),
    course("01:198:112", "DATA STRUCTURES", "198", "112", [section("00003", "01", ["DOE, JANE"])]),
    course("01:640:151", "CALCULUS I", "640", "151", [section("00004", "01", ["NOBODY, NEW"])],
           subject_description="MATHEMATICS", core=[{"coreCode": "QQ", "coreCodeDescription": "Quant"}]),
]
OPEN = ["00001", "00003", "00004"]


def make_db(path):
    conn = sqlite3.connect(path)
    conn.executescript(SCHEMA)
    profs = [("p1", 1, "John", "Smith", 4.0, 3.0, 80.0, 10),
             ("p2", 2, "Jane", "Doe", 5.0, 2.0, 90.0, 30),
             ("p3", 3, "Rajesh", "Patel", 3.0, 4.0, 50.0, 5),
             ("p4", 4, "Ravi", "Patel", 2.0, 4.0, 50.0, 5)]
    for pid, lid, f, l, r, d, w, n in profs:
        conn.execute("INSERT INTO professors VALUES (?,?,?,?,?,?,?,?,?,?,?,1)",
                     (pid, lid, f, l, "Computer Science", r, d, w, n, "s", "Rutgers"))
    reviews = [("r1", "p1", "CS111", 5, 5, 3), ("r2", "p1", "CS111", 3, 3, 4),
               ("r3", "p1", "MATH151", 1, 1, 5), ("r4", "p2", "01:198:112", 5, 5, 2)]
    for rid, pid, c, h, cl, d in reviews:
        conn.execute("INSERT INTO ratings (id, professor_id, course, helpful_rating, clarity_rating,"
                     " difficulty_rating) VALUES (?,?,?,?,?,?)", (rid, pid, c, h, cl, d))
    conn.commit()
    conn.close()


def soc_transport(courses=COURSES, open_=OPEN):
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith("courses.json"):
            body = courses
        elif request.url.path.endswith("openSections.json"):
            body = open_
        else:
            return httpx.Response(404)
        return httpx.Response(200, content=gzip.compress(json.dumps(body).encode()))
    return httpx.MockTransport(handler)


@pytest.fixture
def client(tmp_path):
    db = tmp_path / "rmp.sqlite"
    make_db(db)
    settings = Settings(rmp_db=db)
    soc = SocClient(settings.soc_base_url, httpx.Client(transport=soc_transport()))
    return TestClient(create_app(settings, soc=soc))
