# Time Brain V6 — Personal Work Intelligence

## التشغيل
افتح `index.html` مباشرة، أو ارفع المجلد إلى GitHub Pages/أي Web Server. ميزات PWA وService Worker تعمل عند التشغيل عبر HTTP/HTTPS. الرسوم وExcel وFirebase تعتمد على مكتبات CDN.

## منطق يوم العمل الجديد
- عند فتح تاريخ عمل بدون Shift، يطلب النظام وقت الدخول.
- نهاية الدوام = وقت الدخول + 9 ساعات (540 دقيقة).
- أول نشاط يبدأ افتراضيًا عند وقت الدخول.
- النشاط التالي يبدأ افتراضيًا عند نهاية آخر نشاط.
- لا يسمح بتعارض الأنشطة أو تجاوز حدود الدوام.
- إذا غيّر المستخدم وقت البداية وترك فجوة، يجب تصنيف الفجوة قبل حفظ النشاط.
- لا يمكن إغلاق اليوم قبل تغطية كامل نافذة الدوام.
- يتم حفظ وقت الإغلاق الفعلي (`actualCloseAt`) مع بقاء نهاية نافذة الدوام ثابتة عند +9 ساعات.

## التخطيط المسبق
- إنشاء Planned Task بتاريخ مستقبلي، فئة، مدة متوقعة وملاحظات.
- عند فتح تاريخ المهمة تظهر كتذكير في لوحة القيادة.
- عند إضافة نشاط في ذلك التاريخ تعرض المهام المخططة للاختيار.
- يمكن تحويل المخطط إلى نشاط فعلي، ثم وضعه Done أو إعادة فتحه.

## التحسينات الأربعون — التنفيذ
1. فصل Deep Work Ratio عن مفهوم الكفاءة العامة.
2. Day Score مركب من Deep Work target + Coverage + Meeting load + Context switching.
3. توزيع زمني دقيق للمهام الممتدة عبر أكثر من ساعة في Work Flow chart.
4. تخزين/احتساب End Time لكل نشاط.
5. كشف ومنع Overlapping Activities.
6. معالجة التعارض عبر منع الحفظ وإظهار النشاط المتعارض، مع بقاء التحرير ممكنًا.
7. Workday Boundary واضح: Start + 9h End.
8. نهاية الدوام الرسمية + وقت الإغلاق الفعلي عند Close Day.
9. Unaccounted Time مستقل.
10. فصل Break عن Unaccounted Time وعدم اعتباره Idle تلقائيًا.
11. Gap Classification داخل نافذة الدوام.
12. Daily Close لا يكتمل قبل Reconciliation لكل الفجوات.
13. Context Switching counter.
14. Focus Blocks + Longest Deep Work session.
15. Meeting Load مستقل.
16. Admin Load مستقل.
17. Field Work load مستقل.
18. Best Day-of-Week analysis.
19. Hour-of-Day intelligence عبر توزيع الساعات.
20. Prime Focus Window مبني على التاريخ.
21. Rolling Trends 7D / 14D / 30D / 90D.
22. Week-over-Week comparison.
23. Month-over-Month comparison.
24. Personal baselines بدل thresholds عامة فقط.
25. Anomaly Detection مقارنة بالنمط الشخصي.
26. Behavioral patterns: arrival, weekday, prime time, load patterns.
27. Correlation Engine: Arrival / Meetings / Context Switches مقابل Day Score.
28. Executive Daily Brief موسع.
29. Recommendation Engine مبني على Prime Window والمخاطر الحالية.
30. Close My Day workflow.
31. Day Quality Score 0–100.
32. Goals: Deep Work target / Meeting limit / Gap threshold.
33. Activity Categories قابلة للإضافة والحذف مع منع حذف فئة مستخدمة.
34. Category Metadata: type, weight, color, productive flag, icon, default duration.
35. IndexedDB persistence layer مع localStorage compatibility/migration.
36. Optional Firebase Cloud Sync (Push/Pull) بين الأجهزة.
37. PWA manifest + Service Worker.
38. Quick Entry: Deep Work / Meeting / Field Visit.
39. Live Timer يبدأ من الوقت التالي المتاح ويحوّل المدة إلى نشاط عند الإيقاف.
40. فصل المشروع إلى HTML + CSS + JS + Manifest + Service Worker بدل ملف واحد.

## Cloud Sync
يحتاج مشروع Firebase خاص بالمستخدم. من Settings:
1. فعّل Firestore.
2. فعّل Anonymous Authentication.
3. الصق Firebase Web Config.
4. استخدم Sync ID ثابتًا على أجهزتك.
5. Push يرفع قاعدة البيانات وPull يستعيدها.

لا يحتوي المشروع على أي Firebase credentials افتراضية أو وهمية.

## Excel
التصدير ينشئ:
- `Activity_Log`
- `Planned_Tasks`
- `Daily_KPIs`
- `Database_Raw` (نسخة JSON كاملة للاستعادة)

## Migration
عند أول تشغيل، إذا وجد المشروع بيانات `basel_brain_v5` القديمة، يحاول ترحيلها إلى V6 تلقائيًا مع إنشاء Workday من Arrival القديم.

## V6.1 stability fixes
- Added a real `favicon.ico` plus 192px/512px PWA icons and manifest references.
- Fixed Chart.js runaway page growth by placing every canvas in a bounded responsive `.chart-shell`.
- Added explicit responsive chart heights for desktop, tablet, and mobile.
- Updated Service Worker cache to `timebrain-v6-2` so old CSS/JS is evicted after deployment.
- Service Worker now handles only same-origin assets and uses the HTML fallback only for navigation requests.
- Revalidated JavaScript syntax, static element references, modal references, local assets, duplicate IDs, and CSS brace balance.
