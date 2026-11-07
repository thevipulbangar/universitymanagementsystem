# Graph Report - CP_DBMS  (2026-11-04)

## Corpus Check
- 11 files · ~93,356 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 4 file(s) not represented in the graph (top: .csv 2, (none) 1, .bat 1)

## Summary
- 267 nodes · 521 edges · 9 communities (8 shown, 1 thin omitted)
- Extraction: 94% EXTRACTED · 6% INFERRED · 0% AMBIGUOUS · INFERRED: 32 edges (avg confidence: 0.86)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `91e5bf17`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- support.js
- mongo_db.py
- portal-data.js
- build_timetable.py
- Query
- createRuntime
- createExternalModules
- Handler
- University Management System — VIT Academic Portal

## God Nodes (most connected - your core abstractions)
1. `DbError` - 22 edges
2. `Query` - 15 edges
3. `emit()` - 15 edges
4. `createRuntime()` - 15 edges
5. `update()` - 10 edges
6. `Handler` - 10 edges
7. `getReact()` - 9 edges
8. `walk()` - 9 edges
9. `walkXImport()` - 9 edges
10. `walkElement()` - 9 edges

## Surprising Connections (you probably didn't know these)
- `Database design` --references--> `register_section()`  [INFERRED]
  README.md → mongo_db.py
- `Database design` --references--> `drop_section()`  [INFERRED]
  README.md → mongo_db.py
- `Database design` --references--> `swap_section()`  [INFERRED]
  README.md → mongo_db.py

## Import Cycles
- None detected.

## Communities (9 total, 1 thin omitted)

### Community 0 - "support.js"
Cohesion: 0.07
Nodes (46): boot(), cdnScriptFor(), collectProps(), compileAttr(), compileTemplate(), contentKey(), createComponentFactory(), getDC() (+38 more)

### Community 1 - "mongo_db.py"
Cohesion: 0.08
Nodes (38): _after_write(), both(), check_fks(), check_pw(), check_write(), clean(), context(), DbError (+30 more)

### Community 2 - "portal-data.js"
Cohesion: 0.06
Nodes (35): activity(), ago(), alternatives(), api(), blockers(), conflictsFor(), degreeAudit(), drop() (+27 more)

### Community 3 - "build_timetable.py"
Cohesion: 0.09
Nodes (7): attempt(), blocks_of(), important(), is_block(), make_faculty(), uniq_email(), Server

### Community 4 - "Query"
Cohesion: 0.12
Nodes (4): post(), Query, signInWithPassword(), signOut()

### Community 5 - "createRuntime"
Cohesion: 0.18
Nodes (17): bundledBlob(), createHelmetManager(), applyCanvasBg(), compile(), postDesignMode(), setDesignDocMode(), createRegistry(), bump() (+9 more)

### Community 6 - "createExternalModules"
Cohesion: 0.29
Nodes (8): createExternalModules(), ensureBabel(), load(), resolveGlobal(), waitForGlobal(), isElementClass(), isRenderableType(), resolveDottedPath()

### Community 8 - "University Management System — VIT Academic Portal"
Cohesion: 0.50
Nodes (3): Project layout, Run locally, University Management System — VIT Academic Portal

## Knowledge Gaps
- **1 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Handler` connect `Handler` to `build_timetable.py`?**
  _High betweenness centrality (0.024) - this node is a cross-community bridge._
- **Are the 7 inferred relationships involving `createRuntime()` (e.g. with `adoptParsed()` and `dcUpdate()`) actually correct?**
  _`createRuntime()` has 7 INFERRED edges - model-reasoned connections that need verification._
- **Should `support.js` be split into smaller, more focused modules?**
  _Cohesion score 0.07305669199298656 - nodes in this community are weakly interconnected._
- **Why does `createRuntime()` connect `createRuntime` to `support.js`, `createExternalModules`?**
  _High betweenness centrality (0.014) - this node is a cross-community bridge._
- **Should `mongo_db.py` be split into smaller, more focused modules?**
  _Cohesion score 0.08416130917592052 - nodes in this community are weakly interconnected._
- **Should `portal-data.js` be split into smaller, more focused modules?**
  _Cohesion score 0.05952380952380952 - nodes in this community are weakly interconnected._
- **Should `build_timetable.py` be split into smaller, more focused modules?**
  _Cohesion score 0.0896551724137931 - nodes in this community are weakly interconnected._