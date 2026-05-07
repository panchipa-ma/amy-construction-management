--
-- PostgreSQL database dump
--

\restrict wYlXZVlean0uAJHbbsTY74mUdDaEecPv4HnPZdv9KT4H9KI0fLyVTplNXzKAJzz

-- Dumped from database version 16.10
-- Dumped by pg_dump version 16.10

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Data for Name: app_users; Type: TABLE DATA; Schema: public; Owner: -
--

SET SESSION AUTHORIZATION DEFAULT;

ALTER TABLE public.app_users DISABLE TRIGGER ALL;

COPY public.app_users (id, clerk_user_id, email, display_name, role, status, approved_at, approved_by, created_at) FROM stdin;
55611a1a-607d-48c0-a67f-ec0188c01ebf	user_3DNcCu7TPjPTtSv81smunJl9p2s	liber.watari@gmail.com	KAZUKI	internal	approved	2026-05-07 03:59:02.955+00	bootstrap	2026-05-07 03:59:02.956513+00
\.


ALTER TABLE public.app_users ENABLE TRIGGER ALL;

--
-- Data for Name: customers; Type: TABLE DATA; Schema: public; Owner: -
--

ALTER TABLE public.customers DISABLE TRIGGER ALL;

COPY public.customers (id, name, contact_name, phone, email, address, notes, created_at) FROM stdin;
8e768495-0304-44a9-b28a-c70505833e6f	株式会社リプライス	\N	\N	\N	\N	\N	2026-05-07 02:36:40.66039+00
\.


ALTER TABLE public.customers ENABLE TRIGGER ALL;

--
-- Data for Name: projects; Type: TABLE DATA; Schema: public; Owner: -
--

ALTER TABLE public.projects DISABLE TRIGGER ALL;

COPY public.projects (id, name, code, status, customer_id, site_address, start_date, end_date, contract_amount, notes, created_at, unit_number, sales_commission_rate, sales_rep, site_supervisor) FROM stdin;
ebceaf29-7abc-4c82-8411-1a87ffe9b512	AMY内装工事	\N	estimating	8e768495-0304-44a9-b28a-c70505833e6f	\N	\N	\N	440000	\N	2026-05-07 02:40:05.560012+00	\N	7.5	筒井	はた
\.


ALTER TABLE public.projects ENABLE TRIGGER ALL;

--
-- Data for Name: cost_entries; Type: TABLE DATA; Schema: public; Owner: -
--

ALTER TABLE public.cost_entries DISABLE TRIGGER ALL;

COPY public.cost_entries (id, project_id, category, description, vendor, planned_amount, actual_amount, entry_date, notes, created_at) FROM stdin;
f1df9cec-d08a-47f0-8b96-d7383362e17b	ebceaf29-7abc-4c82-8411-1a87ffe9b512	subcontract	株式会社Value 請求 (AMY内装工事)	株式会社Value	0	165000	2026-05-07	職人見積書からの請求書変換により自動登録（実績）	2026-05-07 04:30:10.136354+00
\.


ALTER TABLE public.cost_entries ENABLE TRIGGER ALL;

--
-- Data for Name: invoices; Type: TABLE DATA; Schema: public; Owner: -
--

ALTER TABLE public.invoices DISABLE TRIGGER ALL;

COPY public.invoices (id, project_id, invoice_number, issue_date, due_date, notes, paid, items, created_at, customer_name, contact_name, subject) FROM stdin;
bc23ad75-6205-4120-bfd7-0a391a81c7ad	ebceaf29-7abc-4c82-8411-1a87ffe9b512	INV-20260507-608	2026-05-07	\N	\N	f	[{"unit": "式", "quantity": 1, "unitPrice": 400000, "description": "AMY内装工事"}]	2026-05-07 04:21:31.320304+00	株式会社リプライス	\N	AMY内装工事
\.


ALTER TABLE public.invoices ENABLE TRIGGER ALL;

--
-- Data for Name: progress_logs; Type: TABLE DATA; Schema: public; Owner: -
--

ALTER TABLE public.progress_logs DISABLE TRIGGER ALL;

COPY public.progress_logs (id, project_id, date, title, description, photo_url, created_at) FROM stdin;
\.


ALTER TABLE public.progress_logs ENABLE TRIGGER ALL;

--
-- Data for Name: staff; Type: TABLE DATA; Schema: public; Owner: -
--

ALTER TABLE public.staff DISABLE TRIGGER ALL;

COPY public.staff (id, name, role, phone, daily_rate, company, created_at) FROM stdin;
\.


ALTER TABLE public.staff ENABLE TRIGGER ALL;

--
-- Data for Name: project_phases; Type: TABLE DATA; Schema: public; Owner: -
--

ALTER TABLE public.project_phases DISABLE TRIGGER ALL;

COPY public.project_phases (id, project_id, name, start_date, end_date, status, color, sort_order, notes, created_at, staff_id) FROM stdin;
dbddab51-852d-4b63-998f-a896a1fafd65	ebceaf29-7abc-4c82-8411-1a87ffe9b512	大工	2026-05-07	2026-05-14	in_progress	\N	0	\N	2026-05-07 02:59:40.753433+00	\N
b644a23d-8bd1-434f-94f0-0dbc512d9c96	ebceaf29-7abc-4c82-8411-1a87ffe9b512	クロス	2026-05-15	2026-05-20	in_progress	\N	0	\N	2026-05-07 03:00:01.445942+00	\N
76f4e26b-da28-43df-b908-7d4c1792c12c	ebceaf29-7abc-4c82-8411-1a87ffe9b512	電気	2026-05-22	2026-05-26	in_progress	\N	0	\N	2026-05-07 03:00:13.440904+00	\N
\.


ALTER TABLE public.project_phases ENABLE TRIGGER ALL;

--
-- Data for Name: quotes; Type: TABLE DATA; Schema: public; Owner: -
--

ALTER TABLE public.quotes DISABLE TRIGGER ALL;

COPY public.quotes (id, project_id, quote_number, issue_date, valid_until, notes, items, created_at, subject, contact_name) FROM stdin;
c8255c36-f3bd-4a2a-85ad-e8cb54ba87d0	ebceaf29-7abc-4c82-8411-1a87ffe9b512	Q-20260507-608	2026-05-07	\N	\N	[{"unit": "式", "notes": "", "quantity": 1, "unitPrice": 150000, "description": "大工工事"}, {"unit": "式", "notes": "", "quantity": 1, "unitPrice": 150000, "description": "クロス工事"}, {"unit": "式", "notes": "", "quantity": 1, "unitPrice": 100000, "description": "電気工事"}]	2026-05-07 02:51:35.68658+00	\N	\N
\.


ALTER TABLE public.quotes ENABLE TRIGGER ALL;

--
-- Data for Name: receipts; Type: TABLE DATA; Schema: public; Owner: -
--

ALTER TABLE public.receipts DISABLE TRIGGER ALL;

COPY public.receipts (id, project_id, cost_entry_id, vendor, unit_number, amount, receipt_date, category, file_url, file_name, notes, status, uploaded_at) FROM stdin;
\.


ALTER TABLE public.receipts ENABLE TRIGGER ALL;

--
-- Data for Name: schedule_entries; Type: TABLE DATA; Schema: public; Owner: -
--

ALTER TABLE public.schedule_entries DISABLE TRIGGER ALL;

COPY public.schedule_entries (id, project_id, staff_id, date, task, start_time, end_time, notes, created_at) FROM stdin;
\.


ALTER TABLE public.schedule_entries ENABLE TRIGGER ALL;

--
-- Data for Name: vendor_invoices; Type: TABLE DATA; Schema: public; Owner: -
--

ALTER TABLE public.vendor_invoices DISABLE TRIGGER ALL;

COPY public.vendor_invoices (id, staff_id, project_id, cost_entry_id, unit_number, amount, invoice_date, file_url, file_name, notes, status, uploaded_at, vendor_name) FROM stdin;
e20c4740-7f88-41b6-8de0-969fbcb33522	\N	\N	\N	AMY内装工事	110000	2026-05-07	/api/storage/objects/uploads/f777f693-60de-42fb-ac99-c004010103e4	請求書_株式会社解体屋_2026-05-07.pdf	作成者: 株式会社解体屋 / 宛名: 株式会社AMY	unmatched	2026-05-07 03:29:03.765947+00	株式会社解体屋
257c357b-1f8f-4f93-924f-601f1564ec27	\N	ebceaf29-7abc-4c82-8411-1a87ffe9b512	f1df9cec-d08a-47f0-8b96-d7383362e17b	AMY内装工事	165000	2026-05-07	/api/storage/objects/uploads/b30c813e-a0d1-4ade-8709-bf6aff775b0c	請求書_株式会社Value_2026-05-07.pdf	職人見積書から変換 / 作成者: KAZUKI / 宛名: 株式会社AMY	matched	2026-05-07 04:30:10.236924+00	株式会社Value
\.


ALTER TABLE public.vendor_invoices ENABLE TRIGGER ALL;

--
-- Data for Name: vendor_quotes; Type: TABLE DATA; Schema: public; Owner: -
--

ALTER TABLE public.vendor_quotes DISABLE TRIGGER ALL;

COPY public.vendor_quotes (id, staff_id, vendor_name, project_id, cost_entry_id, unit_number, amount, quote_date, valid_until, file_url, file_name, notes, status, uploaded_at) FROM stdin;
5dc8bafa-7245-4b65-8c7d-1444e99ed0de	\N	株式会社Value	ebceaf29-7abc-4c82-8411-1a87ffe9b512	65682d1a-d2ad-4409-b74c-af695b901bfa	AMY内装工事	165000	2026-05-07	2026-06-06	/api/storage/objects/uploads/b30c813e-a0d1-4ade-8709-bf6aff775b0c	見積書_株式会社Value_2026-05-07.pdf	作成者: KAZUKI / 宛名: 株式会社AMY	matched	2026-05-07 04:21:00.017942+00
\.


ALTER TABLE public.vendor_quotes ENABLE TRIGGER ALL;

--
-- PostgreSQL database dump complete
--

\unrestrict wYlXZVlean0uAJHbbsTY74mUdDaEecPv4HnPZdv9KT4H9KI0fLyVTplNXzKAJzz

