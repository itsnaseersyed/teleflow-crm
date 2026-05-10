export const LEAD_STATUSES = [
  "New Lead",
  "Interested",
  "Follow-Up Needed",
  "Not Interested",
  "Converted",
  "Busy",
  "No Response",
  "Invalid Number",
] as const;

export const CALL_STATUSES = [
  "Connected",
  "Interested",
  "Not Interested",
  "Busy",
  "No Response",
  "Wrong Number",
  "Converted",
  "Follow-Up Needed",
] as const;

export const PRIORITIES = ["Low", "Medium", "High"] as const;

export function statusBadgeClass(status: string) {
  switch (status) {
    case "Converted":
      return "bg-success/15 text-success border-success/30";
    case "Interested":
      return "bg-secondary/15 text-secondary border-secondary/30";
    case "Follow-Up Needed":
      return "bg-warning/15 text-warning-foreground border-warning/30";
    case "Not Interested":
    case "Invalid Number":
      return "bg-destructive/10 text-destructive border-destructive/30";
    case "Busy":
    case "No Response":
      return "bg-muted text-muted-foreground border-border";
    default:
      return "bg-accent/15 text-accent-foreground border-accent/30";
  }
}

export function priorityBadgeClass(p: string) {
  switch (p) {
    case "High":
      return "bg-destructive/10 text-destructive border-destructive/30";
    case "Medium":
      return "bg-warning/15 text-warning-foreground border-warning/30";
    default:
      return "bg-muted text-muted-foreground border-border";
  }
}
