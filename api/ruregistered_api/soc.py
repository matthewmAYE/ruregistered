"""Client for the public Rutgers Schedule of Classes JSON feed."""
from __future__ import annotations

import gzip
import json

import httpx

from .config import Term


class SocError(RuntimeError):
    pass


def _decode(body: bytes):
    # The feed is sometimes served as raw gzip without a Content-Encoding header.
    if body[:2] == b"\x1f\x8b":
        body = gzip.decompress(body)
    return json.loads(body)


class SocClient:
    def __init__(self, base_url: str, http: httpx.Client | None = None, timeout: float = 90.0):
        self.base_url = base_url.rstrip("/")
        self._http = http or httpx.Client(timeout=timeout, follow_redirects=True)

    def _get(self, name: str, term: Term):
        params = {"year": term.year, "term": term.term, "campus": term.campus}
        try:
            resp = self._http.get(f"{self.base_url}/{name}", params=params)
            resp.raise_for_status()
            return _decode(resp.content)
        except (httpx.HTTPError, ValueError, OSError) as exc:
            raise SocError(f"SOC {name} fetch failed: {exc}") from exc

    def courses(self, term: Term) -> list[dict]:
        data = self._get("courses.json", term)
        if not isinstance(data, list):
            raise SocError("courses.json: unexpected payload")
        return data

    def open_sections(self, term: Term) -> set[str]:
        data = self._get("openSections.json", term)
        if not isinstance(data, list):
            raise SocError("openSections.json: unexpected payload")
        return {str(i) for i in data}
