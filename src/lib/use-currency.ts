"use client";
import { useEffect, useState } from "react";
import { supabaseBrowser } from "./supabase";
import { currencyOf, type Currency } from "./format";
import { DEFAULT_TZ, validTz } from "./tz";

type Shop = { cur: Currency; tz: string; ready: boolean };
const FALLBACK: Shop = { cur: { code: "AED", symbol: "AED", decimals: 2 }, tz: DEFAULT_TZ, ready: false };

/** The shop's currency and time zone, for admin pages that don't otherwise load settings. */
export function useShop(): Shop {
  const [shop, setShop] = useState<Shop>(FALLBACK);
  useEffect(() => {
    supabaseBrowser()
      .from("settings")
      .select("*")
      .eq("id", 1)
      .single()
      .then(({ data }) => data && setShop({ cur: currencyOf(data), tz: validTz(data.timezone), ready: true }));
  }, []);
  return shop;
}

export function useShopCurrency(): Currency {
  return useShop().cur;
}
