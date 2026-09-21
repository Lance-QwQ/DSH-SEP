/** Model guidance for read-only runtime API discovery. */
export declare const CORDIS_SYSTEM_PROMPT = "# Harness runtime inspection\n\nUse cordis_inspect_list to discover Host and Client providers, then cordis_inspect_query to read exact Service, Event, Tool, Theme or Slot APIs. These tools are read-only; queries do not invoke business methods.";
