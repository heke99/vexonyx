# File worker

Consumes quarantined object metadata, validates type/size/archive limits, scans where configured, extracts/chunks content and only then marks artifacts safe for processing/ready. Browser clients cannot promote quarantine status directly.
