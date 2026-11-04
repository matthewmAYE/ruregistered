# ruregistered
Rutgers next big thing for professor ratings

- `api/` Python course API (Rutgers Schedule of Classes joined with ratings). See `api/README.md`.
- `ruregistered-web/` React site. See `ruregistered-web/README.md`.
- `scripts/rmp/collect.py` RateMyProfessors collector that feeds the API's ratings.
- `DESIGN.md` project goals, status and plan.

## RateMyProfessors collector (private use)

`scripts/rmp/collect.py` pulls professors and reviews for one school (default: Rutgers New Brunswick, id 825) into `data/rmp/rmp.sqlite`, which the API reads automatically. RateMyProfessors' terms of use prohibit automated access, so the collected data must not be shared or republished and is git ignored. The default 10 second delay matches the site's robots.txt crawl delay, and the run stops on any HTTP 403 or 429.

```
python scripts/rmp/collect.py professors             # every professor with their overall rating (enough for instructor averages)
python scripts/rmp/collect.py ratings --limit 200    # individual reviews, needed for per course RMP ratings
python scripts/rmp/collect.py export --out data/rmp  # optional CSVs
python -m unittest discover -s tests                 # offline tests, stdlib only
```
