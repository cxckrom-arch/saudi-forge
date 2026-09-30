# KROM FORGE DEV v2.3 — Precision Execution Engine

هذا التحديث يجعل تنفيذ البرومبتات قابلاً للتتبع والتحقق بدل الاعتماد على ذاكرة الوكيل فقط.

## الأدوات الجديدة

### `start_precise_execution`
ابدأ بها قبل تنفيذ أي برومبت كبير. تحفظ البرومبت داخل `.krom-execution/current-task.json` وتحوله إلى Requirement Manifest مرقم مثل R001 وR002.

يمكن تمرير `requirements` يدويًا للحصول على أعلى دقة، أو ترك الأداة تستخرج المتطلبات من البرومبت تلقائيًا.

### `update_execution_requirement`
تحدث حالة كل متطلب:
- `pending`
- `in_progress`
- `verified`
- `blocked`

لا يمكن تعيين `verified` بدون Evidence.

### `execution_status`
يعرض:
- البرومبت الأصلي
- جميع المتطلبات وحالتها
- الملفات التي عُدلت أثناء المهمة
- أدلة الأوامر والاختبارات
- العوائق

### `execution_audit`
بوابة الإغلاق النهائية. تفحص حالة كل requirement وتشغّل build/test/lint/typecheck الموجودة في المشروع. إذا بقي متطلب غير موثق أو فشل Quality Gate فإن النتيجة تكون `FAIL` مع أمر واضح للوكيل بالاستمرار.

## التتبع التلقائي

تم تعديل `write_file` و`patch_file` لتسجيل الملفات المعدلة تلقائيًا في Execution Manifest.

تم تعديل `run_command` لتسجيل الأمر ونتيجته كدليل تنفيذ تلقائيًا.

## سير العمل المطلوب

1. `start_precise_execution`
2. `inspect_project`
3. `search_code` / `read_file`
4. تنفيذ التعديلات باستخدام `write_file` / `patch_file`
5. تشغيل الاختبارات والتحقق
6. `update_execution_requirement` لكل بند مع Evidence
7. `execution_audit`
8. إذا كانت النتيجة FAIL يستمر الوكيل في الإصلاح ولا ينهي المهمة.

## مثال

برومبت المستخدم:

> أصلح واجهة الجوال، لا تحذف الوظائف الحالية، اربط زر الحفظ بقاعدة البيانات، واختبر build.

يبدأ الوكيل:

`start_precise_execution({ prompt: "..." })`

ثم يحصل على متطلبات مرقمة، وينفذها واحدًا واحدًا. قبل الإنهاء يستدعي `execution_audit`.

## مبدأ التنفيذ

الكتابة في الملفات ليست دليل اكتمال. المتطلب يعتبر مكتملًا فقط عندما يكون له Evidence قابل للفحص.
