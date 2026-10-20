"""Build site/assets/data/aef-europe-<year>.json: which AlphaEarth file covers which part of Europe.

Source: the public mirror of the AlphaEarth Foundations Satellite Embedding dataset on Source Cooperative
(https://source.coop/tge-labs/aef, CC BY 4.0, "The AlphaEarth Foundations Satellite Embedding dataset is
produced by Google and Google DeepMind."). Each row: [lon_min, lat_min, lon_max, lat_max, path, epsg].

    pip install pyarrow
    curl -O https://data.source.coop/tge-labs/aef/v1/annual/aef_index_stac_geoparquet.parquet
    python tools/build_aef_index.py aef_index_stac_geoparquet.parquet 2025
"""
import json
import sys

import pyarrow.parquet as pq

EUROPE = (-25, 34, 45, 72)  # lon_min, lat_min, lon_max, lat_max


def main(parquet, year):
    rows = pq.read_table(parquet, columns=["datetime", "proj:epsg", "assets", "bbox"]).to_pylist()
    prefix = f"s3://us-west-2.opendata.source.coop/tge-labs/aef/v1/annual/{year}/"
    tiles = []
    for r in rows:
        b = r["bbox"]
        if r["datetime"].year != year:
            continue
        if b["xmax"] < EUROPE[0] or b["xmin"] > EUROPE[2] or b["ymax"] < EUROPE[1] or b["ymin"] > EUROPE[3]:
            continue
        href = r["assets"]["data"]["href"]
        assert href.startswith(prefix), href
        tiles.append([round(b["xmin"], 4), round(b["ymin"], 4), round(b["xmax"], 4), round(b["ymax"], 4),
                      href[len(prefix):-len(".tiff")], int(r["proj:epsg"].split(":")[1])])
    out = {"year": year, "base": f"https://data.source.coop/tge-labs/aef/v1/annual/{year}/", "tiles": tiles}
    path = f"site/assets/data/aef-europe-{year}.json"
    with open(path, "w") as f:
        json.dump(out, f, separators=(",", ":"))
    print(f"{len(tiles)} tiles -> {path}")


if __name__ == "__main__":
    main(sys.argv[1], int(sys.argv[2]))
