# Graph Report - Untitled Workspace  (2026-11-02)

## Corpus Check
- 9 files · ~2,475 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 104 nodes · 101 edges · 14 communities (12 shown, 2 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- current.json
- architecture
- debt
- ui
- dependencies
- tests
- files
- deep
- limits
- performance
- plan
- security
- project.md
- README.md

## God Nodes (most connected - your core abstractions)
1. `architecture` - 13 edges
2. `ui` - 12 edges
3. `debt` - 9 edges
4. `tests` - 7 edges
5. `limits` - 5 edges
6. `files` - 5 edges
7. `markers` - 5 edges
8. `performance` - 5 edges
9. `deep` - 5 edges
10. `counts` - 4 edges

## Surprising Connections (you probably didn't know these)
- None detected - all connections are within the same source files.

## Import Cycles
- None detected.

## Communities (14 total, 2 thin omitted)

### Community 0 - "current.json"
Cohesion: 0.13
Nodes (14): agents, diagrams, architecture, dependencies, durationMs, generatedAt, integrations, intelGeneratedAt (+6 more)

### Community 1 - "architecture"
Cohesion: 0.15
Nodes (13): architecture, areas, buildTools, entryPoints, frameworks, graph, languages, monorepo (+5 more)

### Community 2 - "debt"
Cohesion: 0.15
Nodes (13): debt, basis, cycles, hotspots, largeFiles, markers, perKloc, scannedLines (+5 more)

### Community 3 - "ui"
Cohesion: 0.17
Nodes (12): ui, ariaCoverage, basis, componentFiles, hardcodedColors, images, imagesWithAlt, interactiveElements (+4 more)

### Community 4 - "dependencies"
Cohesion: 0.18
Nodes (11): dev, other, prod, dependencies, counts, duplicates, entries, entriesTruncated (+3 more)

### Community 5 - "tests"
Cohesion: 0.29
Nodes (7): tests, areas, coverage, ratio, runners, sourceFiles, testFiles

### Community 6 - "files"
Cohesion: 0.40
Nodes (5): files, bytes, sourceFiles, total, truncated

### Community 7 - "deep"
Cohesion: 0.40
Nodes (5): deep, findings, rejected, sessionIds, status

### Community 8 - "limits"
Cohesion: 0.40
Nodes (5): limits, filesTruncated, textBytesRead, textFilesRead, textsTruncated

### Community 9 - "performance"
Cohesion: 0.40
Nodes (5): performance, assetBytes, basis, buildOutputs, largeAssets

### Community 10 - "plan"
Cohesion: 0.50
Nodes (4): plan, edited, tasks, updatedAt

### Community 11 - "security"
Cohesion: 0.50
Nodes (4): security, findings, omitted, trackedChecked

## Knowledge Gaps
- **85 isolated node(s):** `version`, `workspaceName`, `generatedAt`, `durationMs`, `intelGeneratedAt` (+80 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **2 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `architecture` connect `architecture` to `current.json`, `files`?**
  _High betweenness centrality (0.286) - this node is a cross-community bridge._
- **Why does `debt` connect `debt` to `current.json`?**
  _High betweenness centrality (0.207) - this node is a cross-community bridge._
- **Why does `ui` connect `ui` to `current.json`?**
  _High betweenness centrality (0.193) - this node is a cross-community bridge._
- **What connects `version`, `workspaceName`, `generatedAt` to the rest of the system?**
  _85 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `current.json` be split into smaller, more focused modules?**
  _Cohesion score 0.13333333333333333 - nodes in this community are weakly interconnected._