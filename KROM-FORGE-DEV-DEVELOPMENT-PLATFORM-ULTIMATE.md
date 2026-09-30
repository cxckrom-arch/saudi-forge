# KROM FORGE DEV — ULTIMATE AI DEVELOPMENT PLATFORM

## هوية المنتج

ابنِ منصة تطوير ذكية كاملة باسم **KROM FORGE DEV**، وهي بيئة تطوير مؤسسية حديثة تجمع أفضل خصائص Visual Studio Code وCursor وReplit وv0 وGitHub Codespaces، مع تركيز على البناء الحقيقي للمواقع والتطبيقات وواجهات API وتطبيقات سطح المكتب والجوال والألعاب.

المنصة ليست Chat UI أو محرر كود تجميلياً. يجب أن تفتح المشاريع وتشغّلها وتفحصها وتعدل ملفاتها وتختبرها وتعرضها وتنشرها فعلياً. أي زر أو قائمة أو Terminal أو تكامل غير عامل يعتبر عيباً يمنع التسليم.

## الدور الإلزامي للمنصة

اعمل كفريق واحد مكوّن من:

- Principal Software Architect
- Senior Full-Stack Engineer
- Frontend/UI Engineer
- Backend/API Engineer
- Database Engineer
- AI/LLM Engineer
- DevOps/Cloud Engineer
- Security Engineer
- QA/Automation Engineer
- UX/Product Designer
- Technical Writer

يجب أن تفهم نية المستخدم، تفحص المشروع، تخطط، تنفذ، تشغّل الأوامر الحقيقية، تختبر، تصلح الأخطاء، ثم تقدم دليلاً على النتيجة.

## عقد عدم الوهم

- ممنوع Fake Terminal أو مخرجات مصطنعة أو Progress وهمي.
- ممنوع زر بلا handler أو route ميت أو تكامل يدّعي الاتصال دون تحقق.
- ممنوع إنشاء كود في الذاكرة فقط؛ كل تغيير مهم يجب أن يحفظ على القرص داخل Workspace ويظهر في diff.
- ممنوع حذف ملفات أو إعادة كتابة مشروع كامل دون Backup وسبب واضح.
- ممنوع إخفاء الأخطاء؛ اعرض command، exit code، stdout، stderr، duration، والملفات المتأثرة.
- لا تقل إن المشروع يعمل أو نُشر إلا بعد تشغيل اختبار/بناء/فحص فعلي.
- عند نقص مفتاح أو خدمة خارجية، اعرض `Not configured` مع خطوات الإعداد، ولا تنشئ نجاحاً مزيفاً.
- لا توقف التنفيذ عند خطة أو wireframe؛ نفذ vertical slice قابلاً للتشغيل ثم وسّعه.

## بنية المنتج

أنشئ Desktop-first Web App قابلة للتحويل إلى Desktop عبر Electron أو Tauri، مع Responsive Web/PWA. استخدم:

- React + TypeScript strict + Vite أو Next.js حسب طبيعة التطبيق.
- Monaco Editor لتحرير الكود.
- Node.js service للعزل وتشغيل الأدوات، وPython worker للأعمال المكتبية/التحليلية عند الحاجة.
- SQLite محلياً لإعدادات Workspace والذاكرة، وPostgreSQL/Supabase اختيارياً للمزامنة والحسابات.
- WebSocket/SSE للتحديثات الحية.
- Docker sandbox أو worker process محدود الصلاحيات لتنفيذ الأوامر.
- Playwright/Chrome DevTools للمعاينة والاختبار.
- Git CLI وGitHub API وVercel API وSupabase API عبر adapters حقيقية.

يجوز اختيار بدائل تقنية أفضل، لكن وثّق القرار ولا تستخدم مكتبات كثيرة بلا داعٍ.

## واجهة المستخدم

صمّم واجهة مميزة باسم KROM FORGE DEV، Dark/Light، عربية/إنجليزية، RTL/LTR، حديثة ومهنية.

### التخطيط الرئيسي

- Activity Bar: Explorer، Search، Source Control، Run، Extensions، AI Agents، Database، Deployments، Settings.
- Primary Sidebar للسياق المحدد.
- Editor Area مع tabs وsplit editors وbreadcrumbs وminimap وsymbols.
- Bottom Panel: Terminal، Problems، Output، Debug Console، Ports، Tests، Git Changes.
- AI Command Center جانبي قابل للطي مع محادثة، خطة، ملفات مستهدفة، diff، approvals، وtask progress.
- Preview Panel للمتصفح/الجوال مع URL وports وresponsive devices وConsole وNetwork.
- Status Bar: branch، language، formatter، errors/warnings، model، runtime، memory، connection.

### تجربة الاستخدام

- Command Palette كاملة مع اختصارات قابلة للتخصيص.
- Quick Open، Go to File/Symbol/Definition، rename، refactor، format، multi-cursor.
- Drag-and-drop للملفات، tabs قابلة للإغلاق وإعادة الترتيب، restore sessions.
- Keyboard-first، accessibility، focus states، contrast، reduced motion.
- لا تستخدم نصوصاً placeholder في العمليات الرئيسية؛ استخدم حالات فارغة تعليمية وأفعالاً فعلية.

## إدارة المشاريع وWorkspace

- Create Project Wizard: نوع المشروع، framework، اللغة، package manager، runtime، قاعدة البيانات، auth، القالب، Git، النشر.
- Open Folder، Clone Repository، Import ZIP، Recent Workspaces، Multi-root Workspace.
- دعم monorepo وworkspaces و`.env.example` و`.gitignore` وproject instructions مثل `AGENTS.md`.
- Detect Project يقرأ package.json، lockfiles، pyproject، requirements، Cargo، Gradle، solution files، Docker، config، scripts، framework indicators.
- Project Health يعرض runtime وdependency manager وscripts وports وmissing env vars وtest/build commands.
- Workspace snapshots قبل تعديلات الوكيل، restore، compare، branch، checkpoint، rollback.
- File watcher مضبوط مع debounce، تجاهل node_modules/.git/build artifacts، وعدم إعادة تشغيل لا نهائي.

## Terminal حقيقي وآمن

نفّذ Terminal حقيقياً عبر PTY، وليس محاكاة:

- PowerShell وCommand Prompt وBash وWSL عند توفرها.
- Tabs، split panes، profiles، environment variables، working directory، history، search، copy، clear، kill، restart.
- WebSocket/IPC آمن يرسل stdout/stderr وexit code وsignals والوقت.
- command timeout، process tree kill، maximum output، memory/CPU limits، cancellation.
- سياسة أمان قبل الأوامر الخطرة: delete، format، git reset، database migration، deployment، package scripts غير الموثوقة.
- allowlist/denylist قابلة للتهيئة، approval mode، audit log، وعدم تمرير أسرار إلى logs.
- أوامر جاهزة: install، dev، build، test، lint، typecheck، audit، format، preview، deploy.
- اكتشاف تلقائي لـ npm/pnpm/yarn/bun/pip/uv/cargo/dotnet/gradle بحسب المشروع.

## محرك الذكاء الاصطناعي

أنشئ AI Orchestration Layer لا يرتبط بنموذج واحد:

### Model Adapters

- Ollama محلي عبر `OLLAMA_BASE_URL`، مع اكتشاف الخدمة والنماذج والقدرة على chat/generate/embeddings.
- OpenAI-compatible endpoints، Google/Gemini، Anthropic، وموفرات إضافية عبر adapters.
- Model registry: الاسم، provider، context window، capabilities، latency، cost، privacy، health.
- اختيار تلقائي للنموذج حسب المهمة، مع manual override وfallback وtimeouts وretry.
- streaming حقيقي، cancellation، token usage، cost estimate، model latency، trace ID.
- لا تشفر API keys في المصدر أو قاعدة البيانات دون حماية؛ استخدم secret store ومتغيرات بيئة.

### Agent Modes

- Ask: إجابة وتحليل بلا تعديل.
- Plan: خطة وملفات وأوامر مقترحة بلا تنفيذ.
- Build: تنفيذ التغييرات مع approvals حسب السياسة.
- Fix: تشخيص stack trace/logs ثم patch واختبار regression.
- Refactor: تحسين آمن مع diff ومقارنة behavior.
- Review: مراجعة أمنية وجودة وأداء.
- Test: إنشاء وتشغيل اختبارات وتحليل الفشل.
- Deploy: preflight ثم نشر بعد approval.

### سياق آمن ومفيد

- اجمع context من الملفات ذات الصلة فقط باستخدام AST وsymbol index وgit diff وerrors وterminal output.
- احترم `.gitignore` و`.env` وملفات الأسرار ولا ترسلها للنموذج.
- اعرض الملفات المقترحة وسبب اختيارها قبل التنفيذ.
- نفّذ Patch structured، تحقق من تطبيقه، ثم اعرض diff قابل للمراجعة.
- ذاكرة مشروع قابلة للمسح والتعديل، وملف decisions/architecture notes.
- امنع prompt injection من README أو code comments أو الملفات غير الموثوقة.
- الذكاء الاصطناعي يقترح ولا يتجاوز security policy أو approvals.

## Multi-Agent Engineering Team

أنشئ وكلاء متخصصين مع handoff واضح وshared task graph:

- Architect: architecture وADRs وdependency boundaries.
- Developer: implementation وpatches.
- UI/UX: design system وresponsive/accessibility.
- Database: schema وmigration وqueries.
- QA: tests وE2E وregression.
- Security: threat model وsecrets وauth وdependency audit.
- DevOps: Docker وCI/CD وenvironment وdeploy.
- Debugger: evidence-based root cause analysis.
- Documentation: README وAPI docs وchangelog.

كل وكيل يملك صلاحيات محددة، ويعيد: summary، files changed، commands، results، risks، next action. لا تسمح بتنفيذ متوازٍ على الملف نفسه دون lock أو conflict resolution.

## Code Intelligence

- TypeScript/JavaScript/Python/Java/C#/C++/Go/Rust/PHP/SQL/HTML/CSS/JSON/YAML/Markdown على الأقل.
- Syntax highlighting، diagnostics، autocomplete، hover، go-to-definition، references، rename، outline، formatting.
- LSP adapters قابلة للإضافة، مع health status لكل language server.
- AST indexing وsymbol graph وdependency graph.
- Search literal/regex/semantic، replace preview، exclude patterns.
- Code actions: explain، generate tests، docs، types، error fix، security fix، performance hint.

## Preview وBrowser Lab

- شغّل dev server فعلياً واكتشف port من logs لا من تخمين.
- Preview URL داخل iframe/browser controlled مع proxy آمن.
- Console errors، failed requests، network timings، screenshots، viewport/device presets.
- Reload/restart، open in external browser، QR للموبايل على الشبكة المحلية عند السماح.
- Playwright flows: click، fill، upload، screenshot، accessibility، visual diff.
- عرض build errors داخل Problems وربطها بالسطر والملف.
- لا تعتبر الصفحة ناجحة عند ظهور shell فقط؛ تحقق من التفاعل والمسار الأساسي.

## Git وGitHub

- status، diff، stage/unstage، commit، branches، checkout، stash، merge، rebase بإذن، tags، log، blame.
- Clone/private repositories عبر OAuth أو token آمن.
- Pull Requests: branch، title، body، changed files، checks، comments، merge policy.
- كشف remote ahead/conflicts واقتراح pull/merge آمن، دون force push افتراضياً.
- Commit checkpoints تلقائية قبل agent changes مع conventional commits اختيارية.
- Actions/CI status وartifacts وlogs داخل المنصة.

## قواعد البيانات والـ Backend

- Database Explorer للجداول والمخططات والسياسات والفهارس والاستعلامات.
- Supabase integration: Auth، Postgres، Storage، Realtime، Edge Functions، migrations، RLS، logs.
- Local database adapters لـ SQLite/Postgres/MySQL عند توفرها.
- SQL editor مع syntax، explain، limit، read-only افتراضي، وموافقة للـ DDL/DML الخطير.
- API tester: REST/GraphQL/WebSocket، environments، auth headers، collections، history، response viewer.
- توليد typed client وOpenAPI من المصدر عند الحاجة.

## التصميم والبناء البصري

- Visual Builder اختياري للمواقع والتطبيقات: component tree، properties، spacing، responsive breakpoints، tokens، variants.
- Import screenshot أو وصف نصي إلى wireframe قابل للتحرير، ثم ربطه بكود حقيقي.
- Design system manager للألوان والخطوط والspacing/radius/shadows/components.
- منع التصميمات العامة المتشابهة؛ كل مشروع يحصل على اتجاه بصري منظم.
- Figma import/export أو adapter اختياري إذا كان الاتصال مضبوطاً، مع عدم الادعاء بالنجاح عند غياب credentials.

## القوالب وأنواع المشاريع

وفّر قوالب حقيقية قابلة للتشغيل:

- Next.js/React/Vite SaaS.
- Node/Express/Fastify API.
- Python FastAPI/Django.
- Supabase full-stack.
- Electron/Tauri desktop.
- Flutter/React Native mobile.
- PWA/offline app.
- Admin dashboard، e-commerce، portfolio، landing page، AI app.
- Unity/Godot starter مع أدوات build عند توفرها.

كل قالب يملك README، scripts، env example، tests، lint، build، health route، وseed/demo معلّم بوضوح.

## Vercel وDeployment

- Environments: local، preview، staging، production.
- Preflight: clean git state، tests، build، env validation، migration review، security audit، bundle check.
- Vercel adapter: projects، env vars، deployments، logs، domains، status، rollback.
- Docker build/run وhealth checks عند الحاجة.
- Supabase migrations قبل deploy مع dry-run وbackup recommendation.
- لا تحفظ secret values في git أو logs أو client bundle.
- Deployment timeline يعرض exact commit SHA، build logs، URL، status، rollback action.

## Extensions وPlugins

- Extension registry محلي/remote مع manifest، permissions، version، compatibility، signature/verification عند توفرها.
- APIs واضحة لـ commands، views، language features، terminals، AI tools، themes، debuggers.
- sandbox plugin code وعدم منح filesystem/network secrets افتراضياً.
- enable/disable/uninstall مع cleanup وversion pinning.
- Marketplace integration اختيارية، ولا تثبت إضافة غير موثوقة دون تحذير وموافقة.

## Debugging وSelf-Repair Loop

عند خطأ:

1. اجمع command وexit code وstack trace وbrowser/network/database evidence.
2. حدد symptom وreproduction path وroot cause والملف/السطر.
3. أنشئ خطة إصلاح صغيرة وbackup/checkpoint.
4. طبّق patch محدوداً.
5. شغّل regression test ثم checks أوسع.
6. اعرض before/after والقيود المتبقية.

لا تعالج الخطأ بإخفاء الرسالة أو تعطيل الاختبار أو إضافة retry عشوائي. إذا فشل الإصلاح بعد عدد قابل للتهيئة، توقف واطلب قراراً بدلاً من الحلقة اللانهائية.

## الأمان

- Workspace sandbox وفصل عمليات التنفيذ.
- Path traversal protection، symlink policy، file size limits، upload validation، archive bomb protection.
- CSP، secure headers، XSS/CSRF/SSRF/IDOR protection، rate limits.
- OAuth PKCE، session revocation، MFA support، encrypted secrets.
- Redaction في logs وAI context وexports.
- Audit log append-only لكل أمر، تعديل، agent run، secret access، deployment، database mutation.
- Dependency audit وlicense report وSBOM اختياري.
- زر Emergency Stop يوقف عمليات الوكلاء والعمليات الفرعية بأمان.

## الأداء والاعتمادية

- لا تجمد واجهة المستخدم أثناء install/build/AI/scan؛ استخدم workers وstreaming.
- queue للمهام الطويلة مع progress حقيقي وcancel/retry.
- caching محسوب، file indexing incremental، limits للذاكرة والمخرجات.
- reconnect تلقائي مع backoff للـ WebSocket/SSE، واستعادة الجلسة.
- crash recovery، autosave، session restore، وsafe mode عند فشل extension.
- health dashboard للخدمات والنماذج والـ terminal والـ preview والـ integrations.

## الاختبارات الإلزامية

- Unit: state، parsers، permissions، command policy، model routing.
- Integration: filesystem، PTY، Git، adapters، database، queues.
- E2E: إنشاء مشروع → كتابة ملف → تشغيل terminal → preview → إصلاح خطأ → اختبار → git commit → deploy preview.
- Security: منع command injection/path traversal/secret leakage/unauthorized file access.
- Failure tests: model offline، Ollama stopped، port occupied، npm failure، network loss، merge conflict، process crash.
- Accessibility وRTL/LTR وresponsive وkeyboard.
- Performance: startup، indexing، large repo، 100k log lines، concurrent jobs.
- Release smoke test على بيئة نظيفة من clone جديد.

## Release Gate

أنشئ الأمر `release:gate` أو ما يعادله، وينتج PASS/WARN/BLOCK مع JSON وMarkdown.

لا يُسمح بالتسليم أو النشر عند:

- TypeScript/lint/build failure.
- E2E critical flow failure.
- route/action ميت.
- secret داخل المصدر أو logs.
- terminal غير فعلي أو preview غير قابل للتشغيل.
- security test failure.
- عدم وجود rollback/checkpoint للعمليات الخطرة.

النتيجة النهائية يجب أن تحتوي: commit SHA، commands executed، exit codes، tests، screenshots/URLs إن وجدت، files changed، known risks، blocked items، وخطة التراجع.

## التوثيق والتسليم

أنشئ:

- README عربي/إنجليزي.
- ARCHITECTURE.md وADRs.
- `.env.example` بلا أسرار.
- CONTRIBUTING.md وSECURITY.md.
- API/Plugin/Agent documentation.
- Troubleshooting guide لأخطاء Node وPowerShell وOllama وGit وSupabase وVercel.
- User guide وDeveloper guide.
- Changelog وrelease notes.
- Scripts واضحة: `dev`, `build`, `check`, `test`, `test:e2e`, `verify`, `release:gate`.

## خطة التنفيذ

### Phase 1 — Foundation

Shell، routing، theme/i18n، workspace، file explorer، Monaco، real PTY، settings، logging.

### Phase 2 — Engineering Core

Project detector، command palette، diagnostics، Git، search، checkpoints، AI chat/plan/apply.

### Phase 3 — Preview and QA

dev server، ports، browser preview، console/network، Playwright، Problems، test runner.

### Phase 4 — Integrations

Ollama، model adapters، GitHub، Supabase، Vercel، secrets، databases، API tester.

### Phase 5 — Agents and Recovery

multi-agent graph، approvals، self-repair، conflict handling، extension sandbox، observability.

### Phase 6 — Production Release

security hardening، performance، accessibility، packaging Electron/Tauri، CI/CD، release gate، rollback.

لا تنتقل إلى المرحلة التالية قبل تقرير Gate للمرحلة الحالية.

## أول مهمة عند التشغيل

ابدأ بفحص البيئة والمشروع الحالي:

1. اكتشف نظام التشغيل، Node، package manager، Python، Git، Docker، Ollama، المتصفحات، وCLI tools.
2. افحص الملفات والتعليمات وGit status وscripts.
3. أنشئ Project Health Report.
4. أنشئ خطة قصيرة قابلة للتنفيذ.
5. نفذ Foundation vertical slice.
6. شغّل التطبيق محلياً وافتح preview فعلياً.
7. نفذ الاختبارات ثم اعرض الأدلة.

إذا لم يوجد مشروع، افتح Wizard لإنشاء مشروع حقيقي. إذا كان المشروع موجوداً، لا تستبدله؛ اعمل داخله مع checkpoint وdiff.

## معيار النجاح النهائي

يُقبل KROM FORGE DEV فقط عندما يستطيع مستخدم جديد:

1. فتح أو إنشاء مشروع.
2. رؤية الملفات وتعديلها وحفظها.
3. تشغيل أمر حقيقي من Terminal ومشاهدة نتيجته.
4. تشغيل dev server واكتشاف preview.
5. طلب إصلاح خطأ من AI ومراجعة diff.
6. تشغيل الاختبارات ورؤية الفشل والنجاح.
7. عمل commit وbranch وpush آمن.
8. ربط Ollama أو مزود خارجي دون كشف الأسرار.
9. ربط Supabase أو API مع حالة اتصال صحيحة.
10. إنشاء deployment preview أو معرفة سبب منعه.
11. استعادة checkpoint عند فشل التعديل.
12. الحصول على تقرير Release Gate قابل للتدقيق.

نفّذ الآن. لا تكتفِ بشرح ما يمكن فعله. ابنِ النظام، شغّله، اختبره، أصلح أخطاءه، ووثّق ما تم التحقق منه فعلياً.
