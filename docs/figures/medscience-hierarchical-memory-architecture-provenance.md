# MedScience hierarchical-memory figure

## Recommended manuscript caption

**Figure X. Evidence-gated hierarchical scientific memory architecture proposed for MedScience.** (a) Runtime scientific context—including the active hypothesis branch, agent role, and privacy scope—is mapped by an ontology-guided `MemoryRouter` using multi-label entity resolution, hybrid retrieval, epistemic reranking, and hard policy gates. (b) The memory substrate combines an availability hierarchy (`Core`, `Working/Episodic`, and `Archival`) with a scientific semantic namespace tree (`Project → Domain/Entity/Hypothesis/Method/Open issue`). (c) A least-privilege context assembler mounts bounded, agent-specific views, isolating competing hypothesis branches and local protected-health-information data. (d) Durable memory is written only through the `EvidenceVerifier`, immutable evidence records, a versioned claim ledger, and a multi-criterion memory-admission gate. Blue denotes retrieval/read paths, green denotes verified writeback, and red denotes blocked or quarantined outputs. Evidence remains the source of truth; memory is a derived, auditable, and revocable view.

## Design and scientific rationale

- The figure separates the **read path** from the **write path** to prevent retrieved or model-generated text from being mistaken for validated scientific evidence.
- The memory architecture is explicitly two-dimensional: availability/durability tiers control when information is mounted, while the semantic namespace tree controls where it belongs.
- The `Hᵢ subtree only` mount operationalizes hypothesis-branch isolation, preventing premature leakage of conclusions between competing hypotheses.
- The bottom consolidation path makes durable-memory admission contingent on provenance, entailment, privacy, temporal validity, contradiction analysis, deduplication, and scope checks.
- PHI is shown as a local, encrypted, separately authorized vault to align the memory design with MedScience's biomedical and clinical privacy requirements.

## Production provenance

The figure was deterministically composed as SVG from the MedScience architectural analysis in `0908改进.md`. No external illustrations, stock assets, screenshots, or generative-image outputs were used. The PDF export contains embedded Liberation Sans fonts and no raster XObjects; the PNG export is 3600 × 2359 pixels at 300 dpi.

## Export guidance

- Use the **PDF** for manuscript submission when the journal accepts vector figures.
- Use the **SVG** for editing labels, colors, or journal-specific typography.
- Use the **PNG** for preview, review systems, or raster-only submission portals.
