export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase";
import { getSession } from "@/lib/auth";

export const EXPENSE_CATEGORIES = [
  "Ток",           // Electricity
  "Вода",           // Water
  "Интернет",       // Internet/WiFi
  "Ремонт",         // Repairs
  "Персонал",       // Staff wages
  "Оборудване",     // Equipment
  "Спално бельо",   // Bedsheets/linen
  "Консумативи",    // Supplies (soaps, shampoo, etc.)
  "Почистване",     // Cleaning
  "Застраховка",    // Insurance
  "Данъци",         // Taxes
  "Реклама",        // Advertising/marketing
  "Комисионни",     // Commission fees (manual entry)
  "Друго",          // Other
] as const;

const ExpenseInput = z.object({
  category: z.string().min(1).max(100),
  description: z.string().max(500).optional().nullable(),
  amount: z.number().positive().max(999999),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const category = searchParams.get("category");

  let query = supabaseAdmin
    .from("Expense")
    .select("*")
    .order("date", { ascending: false });

  if (from) query = query.gte("date", from);
  if (to) query = query.lte("date", to);
  if (category) query = query.eq("category", category);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const parsed = ExpenseInput.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", issues: parsed.error.issues }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("Expense")
    .insert({
      category: parsed.data.category,
      description: parsed.data.description || null,
      amount: parsed.data.amount,
      date: parsed.data.date,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
