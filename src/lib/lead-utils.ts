export const LEAD_STATUSES = [
  "Unassigned",
  "Assigned",
  "In Progress",
  "Completed",
  "Follow-Up",
  "Converted",
  "Not Interested",
] as const;

export const CALL_STATUSES = [
  "Interested",
  "Follow-Up Needed",
  "Not Interested",
  "Busy",
  "No Response",
  "Switched Off",
  "Converted",
  "Invalid Number",
] as const;

export function statusBadgeClass(status: string) {
  switch (status) {
    case "Converted":
    case "Completed":
      return "bg-success/15 text-success border-success/30";
    case "Interested":
    case "Assigned":
      return "bg-secondary/15 text-secondary border-secondary/30";
    case "Follow-Up Needed":
    case "Follow-Up":
      return "bg-warning/15 text-warning-foreground border-warning/30";
    case "Not Interested":
    case "Invalid Number":
      return "bg-destructive/10 text-destructive border-destructive/30";
    case "Busy":
    case "No Response":
    case "In Progress":
      return "bg-muted text-muted-foreground border-border";
    case "Unassigned":
      return "bg-amber-100 text-amber-700 border-amber-300";
    default:
      return "bg-accent/15 text-accent-foreground border-accent/30";
  }
}

