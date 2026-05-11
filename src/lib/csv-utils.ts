/**
 * CSV Import Utilities
 * Handles CSV parsing, validation, and duplicate detection
 */

export interface LeadRow {
  customer_name?: string;
  customerName?: string;
  name?: string;
  mobile_number?: string;
  mobileNumber?: string;
  phone?: string;
  city?: string;
  interested_service?: string;
  interestedService?: string;
  service?: string;
  priority?: string;
  remarks?: string;
  notes?: string;
}

export interface ParsedLead {
  customerName: string;
  mobileNumber: string;
  city?: string;
  interestedService?: string;
  priority?: "High" | "Medium" | "Low";
  remarks?: string;
}

export interface ParseResult {
  success: boolean;
  leads: ParsedLead[];
  errors: string[];
  warnings: string[];
}

export interface ValidationResult {
  valid: true;
  data: ParsedLead;
}

export interface ValidationError {
  valid: false;
  error: string;
  row?: number;
}

export type ValidationRes = ValidationResult | ValidationError;

/**
 * Validate mobile number (basic validation)
 */
export function isValidMobileNumber(number: string): boolean {
  if (!number) return false;
  // Remove all non-digit characters
  const cleaned = number.replace(/\D/g, "");
  // Accept 10-13 digit numbers (covers most country formats)
  return cleaned.length >= 10 && cleaned.length <= 13;
}

/**
 * Normalize mobile number - remove all non-digit characters
 */
export function normalizeMobileNumber(number: string): string {
  return number.replace(/\D/g, "");
}

/**
 * Validate priority
 */
export function isValidPriority(
  priority?: string,
): priority is "High" | "Medium" | "Low" {
  if (!priority) return false;
  const p = priority.trim().toLowerCase();
  return ["high", "medium", "low"].includes(p);
}

/**
 * Normalize priority to standard format
 */
export function normalizePriority(priority?: string): "High" | "Medium" | "Low" {
  if (!priority) return "Medium";
  const p = priority.trim().toLowerCase();
  if (p === "high") return "High";
  if (p === "low") return "Low";
  return "Medium";
}

/**
 * Parse a single lead row
 */
export function validateLeadRow(row: LeadRow, rowNumber?: number): ValidationRes {
  // Extract fields (handle multiple variations)
  const customerName =
    row.customer_name || row.customerName || row.name || "";
  const mobileNumber =
    row.mobile_number || row.mobileNumber || row.phone || "";
  const city = row.city || "";
  const interestedService =
    row.interested_service || row.interestedService || row.service || "";
  const priority = row.priority || "";
  const remarks = row.remarks || row.notes || "";

  // Validate required fields
  const name = customerName.trim();
  const mobile = mobileNumber.trim();

  if (!name) {
    return {
      valid: false,
      error: "Customer name is required",
      row: rowNumber,
    };
  }

  if (!mobile) {
    return {
      valid: false,
      error: "Mobile number is required",
      row: rowNumber,
    };
  }

  if (!isValidMobileNumber(mobile)) {
    return {
      valid: false,
      error: `Invalid mobile number: ${mobile}`,
      row: rowNumber,
    };
  }

  return {
    valid: true,
    data: {
      customerName: name,
      mobileNumber: normalizeMobileNumber(mobile),
      city: city.trim() || undefined,
      interestedService: interestedService.trim() || undefined,
      priority: isValidPriority(priority) ? normalizePriority(priority) : undefined,
      remarks: remarks.trim() || undefined,
    },
  };
}

/**
 * Parse CSV text content
 */
export function parseCSV(text: string): LeadRow[] {
  const lines = text.split("\n");
  if (lines.length < 2) return [];

  // Parse header
  const headerLine = lines[0];
  const headers = headerLine
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .map((h) => h.replace(/['"]/g, ""));

  // Parse rows
  const rows: LeadRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const values = parseCSVLine(line);
    const row: LeadRow = {};

    headers.forEach((header, index) => {
      row[header as keyof LeadRow] = values[index]?.trim() || "";
    });

    rows.push(row);
  }

  return rows;
}

/**
 * Parse a single CSV line (handles quoted values with commas)
 */
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += char;
    }
  }

  result.push(current);
  return result;
}

/**
 * Parse XLSX file and extract first sheet as CSV-like data
 * Note: For XLSX support, we'll use a simple approach that requires
 * the client to convert XLSX to CSV, or we can add a library later
 */
export async function parseXLSX(file: File): Promise<LeadRow[]> {
  // For now, we'll throw an error telling users to convert to CSV
  // In production, you would use a library like 'xlsx' or 'exceljs'
  throw new Error(
    "XLSX support requires additional library. Please convert to CSV format.",
  );
}

/**
 * Process uploaded file and extract leads
 */
export async function processLeadFile(file: File): Promise<ParseResult> {
  try {
    const fileType = file.name.split(".").pop()?.toLowerCase();

    let rows: LeadRow[] = [];

    if (fileType === "csv") {
      const text = await file.text();
      rows = parseCSV(text);
    } else if (fileType === "xlsx" || fileType === "xls") {
      // For now, we'll require CSV
      return {
        success: false,
        leads: [],
        errors: ["XLSX files are not yet supported. Please use CSV format."],
        warnings: [],
      };
    } else {
      return {
        success: false,
        leads: [],
        errors: [`Unsupported file type: ${fileType}`],
        warnings: [],
      };
    }

    if (rows.length === 0) {
      return {
        success: false,
        leads: [],
        errors: ["CSV file is empty"],
        warnings: [],
      };
    }

    const leads: ParsedLead[] = [];
    const errors: string[] = [];
    const warnings: string[] = [];
    const seen = new Set<string>();

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const result = validateLeadRow(row, i + 2); // +2 because header is row 1, data starts at row 2

      if (!result.valid) {
        errors.push(`Row ${result.row}: ${result.error}`);
        continue;
      }

      const mobile = result.data.mobileNumber;

      if (seen.has(mobile)) {
        warnings.push(
          `Row ${i + 2}: Duplicate mobile number ${mobile} - skipped`,
        );
        continue;
      }

      seen.add(mobile);
      leads.push(result.data);
    }

    return {
      success: leads.length > 0,
      leads,
      errors,
      warnings,
    };
  } catch (err) {
    return {
      success: false,
      leads: [],
      errors: [`Error processing file: ${err instanceof Error ? err.message : "Unknown error"}`],
      warnings: [],
    };
  }
}

/**
 * Generate sample CSV content
 */
export function generateSampleCSV(): string {
  return `customer_name,mobile_number,city,interested_service,priority,remarks
Rajesh Kumar,9876543210,Mumbai,Web Development,High,Interested in React course
Priya Singh,9765432109,Delhi,Mobile App,Medium,Follow up next week
Amit Patel,9654321098,Bangalore,Data Science,Low,Need more info
Sneha Desai,9543210987,Pune,Cloud Computing,High,Ready to join
Vikram Rao,9432109876,Chennai,AI/ML,Medium,Discussing with manager`;
}

/**
 * Generate CSV filename with timestamp
 */
export function generateImportFileName(): string {
  const now = new Date();
  const timestamp = now.toISOString().replace(/[:.]/g, "-").slice(0, -5);
  return `leads_import_${timestamp}.csv`;
}
