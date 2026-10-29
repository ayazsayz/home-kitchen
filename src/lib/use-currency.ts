"use client";
import { useEffect, useState } from "react";
import { supabaseBrowser } from "./supabase";
import { currencyOf, type Currency } from "./format";

/** The shop's currency, for admin pages that don't otherwise load settings. */
export function useShopCurrency(): Currency {
  const [cur, setCur] = useState<Currency>({ code: "AED", symbol: "AED", decimals: 2 });
  useEffect(() => {
    supabaseBrowser()
      .from("settings")
      .select("*")
      .eq("id", 1)
      .single()
      .then(({ data }) => data && setCur(currencyOf(data)));
  }, []);
  return cur;
}
