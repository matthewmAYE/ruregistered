# ruregistered
Rutgers next big thing for professor ratings

## RateMyProfessors collector (private use)

`scripts/rmp/collect.py` pulls professors and reviews for one school (default: Rutgers New Brunswick, id 825) into a local SQLite file. It is for private research only: RateMyProfessors' terms of use prohibit automated access, so the collected data must not be shared or republished. The default 10 second delay matches the site's robots.txt crawl delay, and the run stops on any HTTP 403 or 429.

```
python scripts/rmp/collect.py professors             # roughly one request per 100 professors
python scripts/rmp/collect.py ratings --limit 200    # reviews, most-reviewed professors first
python scripts/rmp/collect.py export --out data/rmp  # CSVs
python -m unittest discover -s tests                 # offline tests
```
