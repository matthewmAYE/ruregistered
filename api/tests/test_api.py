import httpx
import pytest
from fastapi.testclient import TestClient

from conftest import COURSES, soc_transport
from ruregistered_api.config import Settings
from ruregistered_api.main import create_app
from ruregistered_api.names import NameIndex
from ruregistered_api.ratings import course_number_from_rmp
from ruregistered_api.soc import SocClient


def test_search_by_course_number_forms(client):
    for q in ("198:111", "198111", "01:198:111"):
        found = client.get("/v1/courses", params={"q": q}).json()
        assert [c["course_string"] for c in found["results"]] == ["01:198:111"], q


def test_search_by_text_and_filters(client):
    r = client.get("/v1/courses", params={"q": "data struct"}).json()
    assert [c["course_string"] for c in r["results"]] == ["01:198:112"]
    r = client.get("/v1/courses", params={"subject": "mathematics"}).json()
    assert [c["course_string"] for c in r["results"]] == ["01:640:151"]
    r = client.get("/v1/courses", params={"core": "qq"}).json()
    assert r["total"] == 1
    r = client.get("/v1/courses", params={"instructor": "doe"}).json()
    assert r["total"] == 2


def test_open_sections_come_from_open_feed(client):
    c = client.get("/v1/courses/01:198:111").json()
    assert [(s["index"], s["open"]) for s in c["sections"]] == [("00001", True), ("00002", False)]
    assert c["sections_open"] == 1
    assert client.get("/v1/courses", params={"q": "calculus", "open_only": True}).json()["total"] == 1
    assert client.get("/v1/courses", params={"q": "00002"}).json()["total"] == 1  # section index


def test_course_ratings_joined(client):
    c = client.get("/v1/courses/01:198:111").json()
    avg = c["ratings"]["rmp_instructor_average"]
    # Smith 4.0 x10, Patel is ambiguous (two Patels, "R" fits both) -> only Smith and Doe? Doe 5.0 x30
    assert avg["num_instructors"] == 2 and avg["num_ratings"] == 40
    assert avg["avg_rating"] == round((4.0 * 10 + 5.0 * 30) / 40, 2)
    # course-specific: Smith's two CS111 reviews average 4.0 quality, 3.5 difficulty (MATH151 ignored)
    assert c["ratings"]["rmp_this_course"] == {"avg_rating": 4.0, "avg_difficulty": 3.5, "num_ratings": 2}
    assert c["ratings"]["sirs"] is None


def test_instructor_matching_states(client):
    secs = client.get("/v1/courses/01:198:111/sections").json()["sections"]
    smith, doe, patel = (i for s in secs for i in s["instructors"])
    assert smith["match"] == {"status": "matched", "confidence": "exact"}  # middle initial ignored
    assert doe["rmp"]["avg_rating"] == 5.0
    assert patel["match"]["status"] == "ambiguous" and patel["rmp"] is None
    nobody = client.get("/v1/sections/00004").json()["instructors"][0]
    assert nobody["match"]["status"] == "unmatched"


def test_meeting_times_formatted(client):
    m = client.get("/v1/sections/00001").json()["meeting_times"][0]
    assert (m["day_name"], m["start"], m["start_display"], m["end_display"]) == ("Monday", "15:50", "3:50 PM", "5:10 PM")


def test_sort_and_filter_by_rating(client):
    r = client.get("/v1/courses", params={"sort": "rating", "level": "U"}).json()["results"]
    assert [c["course_string"] for c in r] == ["01:198:112", "01:198:111", "01:640:151"]
    r = client.get("/v1/courses", params={"min_rating": 4.5}).json()
    assert [c["course_string"] for c in r["results"]] == ["01:198:112"]


def test_professor_routes(client):
    r = client.get("/v1/professors", params={"q": "doe", "rated_only": True}).json()
    assert r["total"] == 1 and r["results"][0]["key"] == "doe-jane"
    p = client.get("/v1/professors/doe-jane").json()
    assert p["rmp"]["num_ratings"] == 30
    assert [c["course_string"] for c in p["courses"]] == ["01:198:111", "01:198:112"]
    assert client.get("/v1/professors/nope").status_code == 404


def test_not_found_and_validation(client):
    assert client.get("/v1/courses/01:999:999").status_code == 404
    assert client.get("/v1/sections/99999").status_code == 404
    assert client.get("/v1/courses", params={"term": 5}).status_code == 422
    assert client.get("/v1/courses/01198111").status_code == 200  # compact form


def test_meta(client):
    m = client.get("/v1/meta").json()
    assert m["courses"] == 3 and m["sections"] == 4
    assert m["ratings"]["soc_instructors_matched"] == 2


def test_works_without_ratings_database(tmp_path):
    settings = Settings(rmp_db=tmp_path / "missing.sqlite")
    soc = SocClient(settings.soc_base_url, httpx.Client(transport=soc_transport()))
    c = TestClient(create_app(settings, soc=soc))
    body = c.get("/v1/courses/01:198:111").json()
    assert body["ratings"]["rmp_instructor_average"] is None
    assert c.get("/v1/meta").json()["ratings"]["available"] is False


def test_soc_outage_returns_502(tmp_path):
    transport = httpx.MockTransport(lambda r: httpx.Response(503))
    settings = Settings(rmp_db=tmp_path / "x.sqlite")
    c = TestClient(create_app(settings, soc=SocClient(settings.soc_base_url, httpx.Client(transport=transport))))
    assert c.get("/v1/courses").status_code == 502


def test_name_index_fuzzy():
    idx = NameIndex([("a", "Robert", "Van Der Berg", "Physics"), ("b", "Mary Ann", "Lee", "History")])
    assert idx.match("VAN DER BERG, ROB").confidence == "fuzzy"
    assert idx.match("VANDERBERG, R").professor_id == "a"
    assert idx.match("LEE, MARY").professor_id == "b"
    assert idx.match("LEE, X").status == "unmatched"


def test_name_index_uses_department_for_last_name_only_and_ties():
    idx = NameIndex([("w1", "Hao", "Wang", "Computer Science"), ("w2", "Hao", "Wang", "Mathematics"),
                     ("w3", "Li", "Wang", "Physics"), ("k1", "Anna", "Koerber", "Chemistry")])
    assert idx.match("WANG, HAO").status == "ambiguous"
    m = idx.match("WANG, HAO", ["MATHEMATICS"])
    assert (m.professor_id, m.confidence) == ("w2", "department")
    assert idx.match("WANG").status == "ambiguous"  # three Wangs, no hints
    assert idx.match("WANG", ["PHYSICS"]).professor_id == "w3"
    assert idx.match("KOERBER", ["CHEMISTRY"]).professor_id == "k1"
    assert idx.match("KOERBER", ["ENGLISH"]).status == "unmatched"  # lone candidate but wrong department
    assert idx.match("KOERBER").status == "unmatched"


@pytest.mark.parametrize("text,expected", [("CS111", "111"), ("01:198:111", "111"), ("198111", "111"),
                                           ("CALC1", None), ("CS1011", None), (None, None)])
def test_course_number_from_rmp(text, expected):
    assert course_number_from_rmp(text) == expected
