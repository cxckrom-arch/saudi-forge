# KROM FORGE DEV v2.4 — UI DESIGN DIRECTOR

هذه الإضافة تجعل KROM FORGE DEV أقوى في إنشاء وتنفيذ واجهات جميلة وقابلة للاستخدام، وليس مجرد CSS تجميلي.

## الأدوات الجديدة

### `design_ui_prompt`
يولد Prompt تنفيذي عالي الجودة لبناء واجهة فعلية مع:
- اتجاه بصري واضح.
- Design System وتناسق Components.
- Responsive للجوال/التابلت/الديسكتوب.
- RTL عربي كمتطلب أساسي.
- حالات Loading / Empty / Error / Success.
- Accessibility وKeyboard Focus.
- Motion منضبط.
- قواعد تمنع الشكل Generic/Template-like.

أنماط التصميم المتاحة:
- premium
- industrial
- minimal
- glass
- dashboard
- mobile
- editorial
- futuristic

### `generate_design_system`
ينشئ أساس Design System يتضمن:
- Typography scale
- Spacing scale
- Radius scale
- Motion timings
- Control heights
- CSS variable example
- قواعد مرئية موحدة

### `ui_design_quality_check`
يقيم مواصفة أو كود الواجهة من 100 ويبحث عن:
- Responsive
- Design tokens
- Interaction states
- Accessibility
- RTL
- Visual hierarchy
- Reusable components
- Motion discipline

## الدمج مع Prompt Studio

`build_prompt` و `prompt_from_project` يدعمان الآن حقول تصميم إضافية:
- `uiStyle`
- `uiDensity`
- `uiPlatform`
- `rtl`
- `brand`
- `designReferences`

عند استخدام mode=`ui` أو mode=`full` يتم حقن UI/UX Design Director تلقائيًا داخل البرومبت.

## مثال قوي

اطلب من KROM:

> استخدم design_ui_prompt لبناء واجهة Dashboard لمنصة HSE صناعية باسم ABDULKAREM SAFETY BOARD. النمط industrial، responsive، RTL، والكثافة comfortable. أريد Sidebar احترافي، KPI cards، جداول واضحة، خرائط حالة، بطاقات طقس، وإشعارات بدون ازدحام بصري. ثم استخدم start_precise_execution لتنفيذ البرومبت ومراجعة كل بند حتى يمر execution_audit.

## مسار التنفيذ الموصى به

1. `design_ui_prompt`
2. `start_precise_execution`
3. `inspect_project`
4. `search_code` / `read_file`
5. `write_file` / `patch_file`
6. تشغيل التطبيق/الاختبارات المتاحة
7. `ui_design_quality_check`
8. تحديث Evidence لكل requirement
9. `execution_audit`
10. الاستمرار بالإصلاح حتى PASS

## قواعد الجودة المضافة

KROM الآن موجه لرفض هذه الأنماط تلقائيًا:
- Random gradients
- Excessive glow/neon
- Cards لكل شيء
- Giant empty headers
- عشوائية border-radius
- ظلال ثقيلة لكل عنصر
- Emoji بدل أيقونات UI
- ضغط Desktop layout على الجوال
- أزرار شكلية غير مربوطة
- ألوان حالة بدون معنى دلالي

ويركز بدلًا منها على:
- Typography hierarchy
- Structured spacing
- Semantic color/status system
- Consistent components
- Mobile recomposition
- RTL correctness
- Professional icon system
- Data density مناسبة
- Visual QA قبل إعلان الانتهاء
