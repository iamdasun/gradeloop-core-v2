import { NextRequest, NextResponse } from "next/server";

const CIPAS_SYNTACTICS_URL = `${process.env.NEXT_PUBLIC_API_URL}/syntactics`;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ assignmentId: string }> }
) {
  try {
    const { assignmentId } = await params;
    
    // Get format from query params (default: csv)
    const format = request.nextUrl.searchParams.get("format") || "csv";
    
    if (format !== "csv") {
      return NextResponse.json(
        { error: "Only CSV format is currently supported" },
        { status: 400 }
      );
    }

    // Forward request to CIPAS Syntactics service
    const response = await fetch(
      `${CIPAS_SYNTACTICS_URL}/reports/${assignmentId}/export.csv`,
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json(
        { error: `Failed to export report: ${errorText}` },
        { status: response.status }
      );
    }

    // Stream the CSV response
    const csvData = await response.text();
    
    return new NextResponse(csvData, {
      status: 200,
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="similarity_report_${assignmentId}.csv"`,
      },
    });
  } catch (error) {
    console.error("Export proxy error:", error);
    return NextResponse.json(
      { error: "Internal server error during export" },
      { status: 500 }
    );
  }
}
