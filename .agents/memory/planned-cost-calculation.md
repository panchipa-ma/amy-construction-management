---
name: Planned cost calculation
description: Business rule for planned cost, planned profit, and remaining budget across AMY screens and reports.
---

受注計画原価は、契約金額から営業歩合と規定粗利額を引いて算出する。原価明細の計画額合計を受注計画原価として扱わない。残予算は受注計画原価から実績原価を引く。

**Why:** 規定粗利率は営業歩合を差し引いた後にも残す利益率である。たとえば規定利率20%、営業歩合5%なら、原価上限は契約金額の75%でなければならない。原価明細合計や営業歩合控除前の粗利率を使うと、受注計画・予算組み・ダッシュボード・残予算で数値が食い違う。

**How to apply:** 契約金額をA、規定粗利率をR、営業歩合率をSとすると、規定粗利額は round(A × R)、営業歩合は round(A × S)、受注計画原価は A − 規定粗利額 − 営業歩合、残予算は受注計画原価 − 実績原価とする。全画面・API・帳票でこの基準を共有する。