---
name: Planned cost calculation
description: Business rule for planned cost, planned profit, and remaining budget across AMY screens and reports.
---

受注計画原価は、契約金額から規定粗利額を引いて算出する。原価明細の計画額合計を受注計画原価として扱わない。残予算は受注計画原価から実績原価を引く。

**Why:** 規定粗利率を30%に設定した案件では、受注計画の粗利率も30%でなければならない。原価明細合計を使うと、受注計画・予算組み・ダッシュボード・残予算で数値が食い違う。

**How to apply:** 契約金額をA、規定粗利率をRとすると、規定粗利額は round(A × R)、受注計画原価は A − 規定粗利額、残予算は受注計画原価 − 実績原価とする。全画面・API・帳票でこの基準を共有する。