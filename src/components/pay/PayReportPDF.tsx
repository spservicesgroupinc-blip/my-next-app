"use client";

import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
} from "@react-pdf/renderer";
import { format, parseISO } from "date-fns";
import type { PayReportData } from "@/lib/types";

// ─── Styles ───────────────────────────────────────────────────────────────────
const colors = {
  primary: "#ea580c",
  dark: "#0f172a",
  medium: "#475569",
  light: "#94a3b8",
  border: "#e2e8f0",
  rowAlt: "#f8fafc",
  white: "#ffffff",
  headerBg: "#1e293b",
};

const styles = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 9,
    color: colors.dark,
    paddingTop: 36,
    paddingBottom: 50,
    paddingHorizontal: 36,
    backgroundColor: colors.white,
  },
  headerSection: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 20,
    paddingBottom: 16,
    borderBottomWidth: 2,
    borderBottomColor: colors.primary,
  },
  companyBlock: { flexDirection: "column", gap: 2 },
  companyName: { fontSize: 18, fontFamily: "Helvetica-Bold", color: colors.dark },
  companyMeta: { fontSize: 8, color: colors.medium },
  reportTitleBlock: { flexDirection: "column", alignItems: "flex-end", gap: 2 },
  reportTitle: { fontSize: 14, fontFamily: "Helvetica-Bold", color: colors.primary },
  reportPeriod: { fontSize: 9, color: colors.medium },
  infoCard: {
    flexDirection: "row",
    justifyContent: "space-between",
    backgroundColor: colors.rowAlt,
    borderRadius: 4,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  infoGroup: { flexDirection: "column", gap: 3 },
  infoLabel: { fontSize: 7, color: colors.light, textTransform: "uppercase", letterSpacing: 0.5 },
  infoValue: { fontSize: 10, fontFamily: "Helvetica-Bold", color: colors.dark },
  sectionHeading: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    color: colors.medium,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 6,
    marginTop: 4,
  },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: colors.headerBg,
    borderRadius: 3,
    paddingVertical: 5,
    paddingHorizontal: 4,
    marginBottom: 1,
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 4,
    paddingHorizontal: 4,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.border,
  },
  tableRowAlt: { backgroundColor: colors.rowAlt },
  colDate:     { width: "10%", fontSize: 8 },
  colDay:      { width: "7%",  fontSize: 8 },
  colJob:      { width: "20%", fontSize: 8 },
  colClockIn:  { width: "12%", fontSize: 8 },
  colClockOut: { width: "12%", fontSize: 8 },
  colHours:    { width: "8%",  fontSize: 8, textAlign: "right" },
  colRegular:  { width: "7%",  fontSize: 8, textAlign: "right" },
  colOT:       { width: "6%",  fontSize: 8, textAlign: "right" },
  colDT:       { width: "6%",  fontSize: 8, textAlign: "right" },
  colRate:     { width: "4%",  fontSize: 8, textAlign: "right" },
  colPay:      { width: "8%",  fontSize: 8, textAlign: "right" },
  tableHeaderText: { color: colors.white, fontFamily: "Helvetica-Bold", fontSize: 7, textTransform: "uppercase" },
  summarySection: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 16,
    gap: 8,
  },
  summaryBox: {
    flex: 1,
    padding: 10,
    backgroundColor: colors.rowAlt,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: "column",
    gap: 4,
  },
  summaryBoxTitle: { fontSize: 7.5, fontFamily: "Helvetica-Bold", color: colors.medium, textTransform: "uppercase", marginBottom: 2 },
  summaryRow: { flexDirection: "row", justifyContent: "space-between" },
  summaryLabel: { fontSize: 8.5, color: colors.medium },
  summaryValue: { fontSize: 8.5, color: colors.dark },
  summaryTotalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 4,
    marginTop: 2,
  },
  summaryTotalLabel: { fontSize: 9, fontFamily: "Helvetica-Bold", color: colors.dark },
  summaryTotalValue: { fontSize: 9, fontFamily: "Helvetica-Bold", color: colors.primary },
  grossPayBox: {
    alignItems: "flex-end",
    padding: 14,
    backgroundColor: colors.headerBg,
    borderRadius: 4,
    minWidth: 140,
    gap: 4,
  },
  grossPayLabel: { fontSize: 8, color: colors.light, textTransform: "uppercase", letterSpacing: 0.5 },
  grossPayAmount: { fontSize: 22, fontFamily: "Helvetica-Bold", color: colors.white },
  grossPaySub: { fontSize: 7, color: colors.light },
  footer: {
    position: "absolute",
    bottom: 24,
    left: 36,
    right: 36,
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 0.5,
    borderTopColor: colors.border,
    paddingTop: 6,
  },
  footerText: { fontSize: 7, color: colors.light },
  noEntries: { textAlign: "center", color: colors.light, paddingVertical: 20, fontSize: 9 },
});

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmt(isoString: string, pattern: string): string {
  try { return format(parseISO(isoString), pattern); }
  catch { return "—"; }
}
function fmtDate(s: string) { return fmt(s, "MMM d, yyyy"); }
function fmtTime(s: string | null) { return s ? fmt(s, "h:mm a") : "—"; }
function fmtHrs(n: number) { return n.toFixed(2); }
function fmtPay(n: number) { return `$${n.toFixed(2)}`; }

// ─── Component ────────────────────────────────────────────────────────────────
interface PayReportPDFProps {
  data: PayReportData;
}

export function PayReportPDF({ data }: PayReportPDFProps) {
  const {
    employee, company, period_start, period_end,
    entries, total_hours, regular_hours, overtime_hours,
    doubletime_hours, gross_pay, generated_at,
  } = data;

  // Compute from entries for accuracy across mixed rates
  const regularPay = entries.reduce((sum, e) => sum + e.regular_hours * e.hourly_rate, 0);
  const overtimePay = entries.reduce((sum, e) => sum + e.overtime_hours * e.hourly_rate * 1.5, 0);
  const doubletimePay = entries.reduce((sum, e) => sum + e.doubletime_hours * e.hourly_rate * 2, 0);

  return (
    <Document
      title={`Pay Report — ${employee.full_name} — ${fmtDate(period_start)} to ${fmtDate(period_end)}`}
      author={company.name}
      creator="ProTask Pay System"
    >
      <Page size="LETTER" orientation="landscape" style={styles.page}>

        {/* Header */}
        <View style={styles.headerSection}>
          <View style={styles.companyBlock}>
            <Text style={styles.companyName}>{company.name}</Text>
          </View>
          <View style={styles.reportTitleBlock}>
            <Text style={styles.reportTitle}>PAY REPORT</Text>
            <Text style={styles.reportPeriod}>
              {fmtDate(period_start)} — {fmtDate(period_end)}
            </Text>
            <Text style={styles.reportPeriod}>Generated {fmt(generated_at, "MMM d, yyyy h:mm a")}</Text>
          </View>
        </View>

        {/* Employee Info Card */}
        <View style={styles.infoCard}>
          <View style={styles.infoGroup}>
            <Text style={styles.infoLabel}>Employee Name</Text>
            <Text style={styles.infoValue}>{employee.full_name}</Text>
          </View>
          <View style={styles.infoGroup}>
            <Text style={styles.infoLabel}>Base Hourly Rate</Text>
            <Text style={styles.infoValue}>{fmtPay(employee.hourly_rate)} / hr</Text>
          </View>
          <View style={styles.infoGroup}>
            <Text style={styles.infoLabel}>Pay Period</Text>
            <Text style={styles.infoValue}>{fmtDate(period_start)} – {fmtDate(period_end)}</Text>
          </View>
          <View style={styles.infoGroup}>
            <Text style={styles.infoLabel}>Total Entries</Text>
            <Text style={styles.infoValue}>{entries.length}</Text>
          </View>
          <View style={styles.infoGroup}>
            <Text style={styles.infoLabel}>Employee ID</Text>
            <Text style={styles.infoValue}>{employee.id.slice(0, 8).toUpperCase()}</Text>
          </View>
        </View>

        {/* Time Entries Table */}
        <Text style={styles.sectionHeading}>Time Entry Detail</Text>

        <View style={styles.tableHeader}>
          <Text style={[styles.colDate,     styles.tableHeaderText]}>Date</Text>
          <Text style={[styles.colDay,      styles.tableHeaderText]}>Day</Text>
          <Text style={[styles.colJob,      styles.tableHeaderText]}>Job / Project</Text>
          <Text style={[styles.colClockIn,  styles.tableHeaderText]}>Clock In</Text>
          <Text style={[styles.colClockOut, styles.tableHeaderText]}>Clock Out</Text>
          <Text style={[styles.colHours,    styles.tableHeaderText]}>Total Hrs</Text>
          <Text style={[styles.colRegular,  styles.tableHeaderText]}>Reg Hrs</Text>
          <Text style={[styles.colOT,       styles.tableHeaderText]}>OT Hrs</Text>
          <Text style={[styles.colDT,       styles.tableHeaderText]}>DT Hrs</Text>
          <Text style={[styles.colRate,     styles.tableHeaderText]}>Rate</Text>
          <Text style={[styles.colPay,      styles.tableHeaderText]}>Pay</Text>
        </View>

        {entries.length === 0 ? (
          <Text style={styles.noEntries}>No completed time entries found for this period.</Text>
        ) : (
          entries.map((entry, idx) => (
            <View
              key={entry.id}
              style={[styles.tableRow, idx % 2 === 1 ? styles.tableRowAlt : {}]}
            >
              <Text style={styles.colDate}>{fmt(entry.clock_in, "MM/dd/yy")}</Text>
              <Text style={styles.colDay}>{fmt(entry.clock_in, "EEE")}</Text>
              <Text style={styles.colJob}>{entry.job_name}</Text>
              <Text style={styles.colClockIn}>{fmtTime(entry.clock_in)}</Text>
              <Text style={styles.colClockOut}>{fmtTime(entry.clock_out)}</Text>
              <Text style={styles.colHours}>{fmtHrs(entry.duration_hours)}</Text>
              <Text style={styles.colRegular}>{fmtHrs(entry.regular_hours)}</Text>
              <Text style={[styles.colOT, entry.overtime_hours > 0 ? { color: "#d97706" } : {}]}>
                {fmtHrs(entry.overtime_hours)}
              </Text>
              <Text style={[styles.colDT, entry.doubletime_hours > 0 ? { color: "#dc2626" } : {}]}>
                {fmtHrs(entry.doubletime_hours)}
              </Text>
              <Text style={styles.colRate}>${entry.hourly_rate.toFixed(0)}</Text>
              <Text style={[styles.colPay, { fontFamily: "Helvetica-Bold" }]}>{fmtPay(entry.entry_pay)}</Text>
            </View>
          ))
        )}

        {/* Summary */}
        <View style={styles.summarySection}>
          <View style={styles.summaryBox}>
            <Text style={styles.summaryBoxTitle}>Hours Summary</Text>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Regular Hours</Text>
              <Text style={styles.summaryValue}>{fmtHrs(regular_hours)} hrs @ 1x</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Overtime Hours</Text>
              <Text style={styles.summaryValue}>{fmtHrs(overtime_hours)} hrs @ 1.5x</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Doubletime Hours</Text>
              <Text style={styles.summaryValue}>{fmtHrs(doubletime_hours)} hrs @ 2x</Text>
            </View>
            <View style={styles.summaryTotalRow}>
              <Text style={styles.summaryTotalLabel}>Total Hours</Text>
              <Text style={styles.summaryTotalValue}>{fmtHrs(total_hours)} hrs</Text>
            </View>
          </View>

          <View style={styles.summaryBox}>
            <Text style={styles.summaryBoxTitle}>Pay Breakdown</Text>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Regular Pay</Text>
              <Text style={styles.summaryValue}>{fmtPay(regularPay)}</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Overtime Pay</Text>
              <Text style={styles.summaryValue}>{fmtPay(overtimePay)}</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Doubletime Pay</Text>
              <Text style={styles.summaryValue}>{fmtPay(doubletimePay)}</Text>
            </View>
            <View style={styles.summaryTotalRow}>
              <Text style={styles.summaryTotalLabel}>Gross Pay</Text>
              <Text style={styles.summaryTotalValue}>{fmtPay(gross_pay)}</Text>
            </View>
          </View>

          <View style={styles.grossPayBox}>
            <Text style={styles.grossPayLabel}>Total Gross Pay</Text>
            <Text style={styles.grossPayAmount}>{fmtPay(gross_pay)}</Text>
            <Text style={styles.grossPaySub}>
              {fmtHrs(total_hours)} total hrs · {entries.length} entries
            </Text>
          </View>
        </View>

        {/* Footer */}
        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>
            {company.name} · Pay Report · {employee.full_name}
          </Text>
          <Text style={styles.footerText}>
            Generated {fmt(generated_at, "MMM d, yyyy 'at' h:mm a")} · CONFIDENTIAL
          </Text>
          <Text
            style={styles.footerText}
            render={({ pageNumber, totalPages }: { pageNumber: number; totalPages: number }) =>
              `Page ${pageNumber} of ${totalPages}`
            }
          />
        </View>

      </Page>
    </Document>
  );
}
