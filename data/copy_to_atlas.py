"""Copies the local MongoDB database (vit_portal) to MongoDB Atlas for deployment.
Put the Atlas connection link in keys.env as  ATLAS_URI=mongodb+srv://...  then run:
    python data/copy_to_atlas.py            (refuses if Atlas already has data)
    python data/copy_to_atlas.py --replace  (wipes vit_portal on Atlas first)
Login sessions are not copied; indexes are created by serve.py when it starts.
"""
import os, re, sys
import pymongo

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
env = open(os.path.join(ROOT, "keys.env"), encoding="utf-8").read()
m = re.search(r"^\s*(?:CLOUD_DB_URI|ATLAS_URI)\s*=\s*(\S+)", env, re.M)  # any MongoDB-compatible host
if not m: sys.exit("Add CLOUD_DB_URI=mongodb+srv://... to keys.env first.")

src = pymongo.MongoClient(os.environ.get("MONGODB_URI", "mongodb://localhost:27017"))["vit_portal"]
dst = pymongo.MongoClient(m.group(1), serverSelectionTimeoutMS=10000)["vit_portal"]
dst.client.admin.command("ping")

names = [n for n in src.list_collection_names() if n != "sessions"]
if any(dst[n].estimated_document_count() for n in dst.list_collection_names()):
    if "--replace" not in sys.argv: sys.exit("Atlas already has data in vit_portal. Re-run with --replace to overwrite it.")
    for n in dst.list_collection_names(): dst[n].drop()

for n in names:
    batch, total = [], 0
    for doc in src[n].find():
        batch.append(doc)
        if len(batch) == 5000: dst[n].insert_many(batch, ordered=False); total += len(batch); batch = []
    if batch: dst[n].insert_many(batch, ordered=False); total += len(batch)
    print(f"{n}: {total}")

bad = [n for n in names if src[n].count_documents({}) != dst[n].count_documents({})]
print("Copy complete." if not bad else f"Row counts differ for: {bad}")
