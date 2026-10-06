# 📚 Dokumentasi Skema Database & Panduan Pengisian Data (Data Dictionary)

Panduan ini berisi daftar lengkap seluruh tabel, kolom, tipe data, batasan (*constraints*), serta contoh nilai yang harus diisikan (*example payload*) ke dalam database PostgreSQL / Supabase untuk ekosistem **K.E.P.O. (SIAKAD, LMS, & EXAM CBT)**.

---

## 📑 Daftar Isi Modul

1. [Modul 0: Core Identity & Roster](#1-modul-0-core-identity--roster)
   - [`profiles`](#tabel-profiles)
   - [`classes`](#tabel-classes)
   - [`academic_periods`](#tabel-academic_periods)
2. [Modul A: Dynamic Access Control](#2-modul-a-dynamic-access-control)
   - [`features`](#tabel-features)
   - [`feature_access`](#tabel-feature_access)
3. [Modul 1: CBT Exam & Survey Engine](#3-modul-1-cbt-exam--survey-engine)
   - [`exams`](#tabel-exams)
   - [`questions`](#tabel-questions)
   - [`exam_sessions`](#tabel-exam_sessions)
   - [`results`](#tabel-results)
   - [`survey_notifications`](#tabel-survey_notifications)
4. [Modul 2: SIAKAD (Sistem Informasi Akademik)](#4-modul-2-siakad-sistem-informasi-akademik)
   - [`academic_marks`](#tabel-academic_marks)
   - [`report_cards`](#tabel-report_cards)
   - [`attendance`](#tabel-attendance)
   - [`violation_logs`](#tabel-violation_logs)
5. [Modul 3: LMS (Learning Management System)](#5-modul-3-lms-learning-management-system)
   - [`lms_courses`](#tabel-lms_courses)
   - [`lms_enrollments`](#tabel-lms_enrollments)

---

## 1. Modul 0: Core Identity & Roster

### Tabel: `profiles`
Tabel identitas utama pengguna yang terhubung 1:1 dengan `auth.users.id`.

| Nama Kolom | Tipe Data | Nullable / Default | Contoh Nilai yang Diisikan | Keterangan & Aturan |
|---|---|---|---|---|
| `id` | `UUID` | **PK**, `gen_random_uuid()` | `'70a0e0eb-32de-4c13-ac97-b44bf259bfe7'` | ID unik pengguna dari `auth.users.id` |
| `fullname` | `VARCHAR(150)` | **NOT NULL** | `'Kepala Suku'` atau `'Ahmad Fauzi'` | Nama lengkap siswa, guru, atau staf |
| `display_name` | `VARCHAR(150)` | Nullable | `'Ahmad Fauzi, S.Pd.'` | Nama sapaan / tampilan di UI |
| `birth_date` | `DATE` | Nullable | `'2007-08-17'` | Format tanggal lahir `YYYY-MM-DD` |
| `email` | `VARCHAR(255)` | **NOT NULL, UNIQUE** | `'kepalasuku@master.app'` | Alamat email resmi (RFC 5321) |
| `role_level` | `SMALLINT` | **NOT NULL**, Default `1` | `4` *(1, 2, 3, atau 4)* | `4`=Admin, `3`=Teacher, `2`=Officer, `1`=Student/Parent |
| `username` | `VARCHAR(50)` | **UNIQUE**, Nullable | `'kepalasuku@master.app'` | Username untuk login alternatif |
| `phone` | `VARCHAR(20)` | Nullable | `'+6281234567890'` | Nomor HP format internasional E.164 |
| `contact_email` | `VARCHAR(255)` | Nullable | `'wali.ahmad@gmail.com'` | Email sekunder / email kontak wali |
| `contact_phone` | `VARCHAR(20)` | Nullable | `'+6281987654321'` | Nomor HP kontak darurat / wali |
| `avatar_url` | `TEXT` | Nullable | `'https://.../avatar.png'` | Link foto profil / URL gambar |
| `class_id` | `UUID` | Nullable, **FK → classes(id)** | `'4b6e82...-...'` | ID kelas siswa (jika role student) |
| `class_section` | `VARCHAR(50)` | Nullable | `'XI-IPA-1'` | Label teks kelas untuk backward compatibility |
| `created_at` | `TIMESTAMPTZ` | **NOT NULL**, Default `now()` | `'2026-08-08 10:00:00+07'` | Waktu pembuatan akun |
| `updated_at` | `TIMESTAMPTZ` | **NOT NULL**, Default `now()` | `'2026-08-08 10:00:00+07'` | Diupdate otomatis oleh trigger database |

---

### Tabel: `classes`
Daftar kelas / rombongan belajar (rombel) di sekolah.

| Nama Kolom | Tipe Data | Nullable / Default | Contoh Nilai yang Diisikan | Keterangan & Aturan |
|---|---|---|---|---|
| `id` | `UUID` | **PK**, `gen_random_uuid()` | `'c1a2b3c4-...'` | ID unik kelas |
| `name` | `VARCHAR(50)` | **NOT NULL, UNIQUE** | `'XI-IPA-1'` atau `'XII-IPS-2'` | Kode/nama resmi kelas |
| `grade_level` | `SMALLINT` | Nullable | `11` *(1 s/d 13)* | Tingkat kelas (10, 11, 12, dll.) |
| `academic_year` | `VARCHAR(20)` | **NOT NULL**, Default `'2025/2026'` | `'2025/2026'` | Tahun pelajaran aktif |
| `homeroom_teacher_id` | `UUID` | Nullable, **FK → profiles(id)** | `'70a0e0eb-...'` | ID Guru Wali Kelas (Role Level 3) |
| `created_at` | `TIMESTAMPTZ` | **NOT NULL**, Default `now()` | `'2026-08-08 08:00:00+07'` | Waktu data dibuat |

---

### Tabel: `academic_periods`
Referensi semester atau periode tahun ajaran.

| Nama Kolom | Tipe Data | Nullable / Default | Contoh Nilai yang Diisikan | Keterangan & Aturan |
|---|---|---|---|---|
| `id` | `UUID` | **PK**, `gen_random_uuid()` | `'d9f8e7...-...'` | ID unik periode |
| `name` | `VARCHAR(50)` | **NOT NULL, UNIQUE** | `'2025/2026 Ganjil'` | Nama semester |
| `start_date` | `DATE` | **NOT NULL** | `'2025-07-15'` | Tanggal mulai semester (`YYYY-MM-DD`) |
| `end_date` | `DATE` | **NOT NULL** | `'2025-12-20'` | Tanggal akhir semester (`YYYY-MM-DD`) |
| `is_active` | `BOOLEAN` | **NOT NULL**, Default `false` | `true` atau `false` | `true` jika semester saat ini sedang berjalan |
| `created_at` | `TIMESTAMPTZ` | **NOT NULL**, Default `now()` | `'2026-08-08 08:00:00+07'` | Waktu data dibuat |

---

## 2. Modul A: Dynamic Access Control

### Tabel: `features`
Katalog master seluruh modul/fitur yang dapat diaktifkan/dinonaktifkan oleh Admin.

| Nama Kolom | Tipe Data | Nullable / Default | Contoh Nilai yang Diisikan | Keterangan & Aturan |
|---|---|---|---|---|
| `id` | `UUID` | **PK**, `gen_random_uuid()` | `'f1e2d3...-...'` | ID unik fitur |
| `feature_key` | `VARCHAR(60)` | **NOT NULL, UNIQUE** | `'attendance_face_id'` | Kunci fitur unik dalam kode program |
| `display_name` | `VARCHAR(100)` | **NOT NULL** | `'Attendance — Face ID Biometric'` | Nama fitur yang muncul di UI Admin |
| `module` | `VARCHAR(30)` | **NOT NULL**, Default `'general'` | `'attendance'` | Modul: `general`, `siakad`, `lms`, `exam`, `attendance`, `profile` |
| `description` | `TEXT` | Nullable | `'Verifikasi presensi berbasis deteksi wajah'` | Deskripsi fungsi fitur |
| `config` | `JSONB` | **NOT NULL**, Default `'{}'` | `'{"min_confidence": 0.85}'` | Parameter teknis fitur dalam format JSON |
| `is_enabled` | `BOOLEAN` | **NOT NULL**, Default `true` | `true` | Sakelar global fitur di seluruh sistem |
| `sort_order` | `SMALLINT` | **NOT NULL**, Default `0` | `30` | Urutan penataan di dashboard admin |
| `created_at` | `TIMESTAMPTZ` | **NOT NULL**, Default `now()` | `'2026-08-08 08:00:00+07'` | Waktu dibuat |
| `updated_at` | `TIMESTAMPTZ` | **NOT NULL**, Default `now()` | `'2026-08-08 08:00:00+07'` | Waktu update terakhir |

---

### Tabel: `feature_access`
Pemetaan hak akses fitur per tingkatan role (`role_level`) atau override per individu pengguna (`user_id`).

| Nama Kolom | Tipe Data | Nullable / Default | Contoh Nilai yang Diisikan | Keterangan & Aturan |
|---|---|---|---|---|
| `id` | `UUID` | **PK**, `gen_random_uuid()` | `'a1b2c3...-...'` | ID izin akses |
| `feature_key` | `VARCHAR(60)` | **NOT NULL, FK → features(feature_key)** | `'attendance_checkin'` | Kunci fitur yang diaturnya |
| `role_level` | `SMALLINT` | Nullable *(1 s/d 4)* | `2` | Level role (jika berlaku untuk semua user di level tsb) |
| `user_id` | `UUID` | Nullable, **FK → profiles(id)** | `'70a0e0eb-...'` | ID user spesifik (jika override per orang) |
| `is_granted` | `BOOLEAN` | **NOT NULL**, Default `true` | `true` *(diizinkan)* / `false` *(ditolak)* | Status izin akses |
| `granted_by` | `UUID` | Nullable, **FK → profiles(id)** | `'70a0e0eb-...'` | Admin yang menyetujui izin ini |
| `notes` | `TEXT` | Nullable | `'Izin khusus presensi OSIS'` | Catatan alasan override |
| `created_at` | `TIMESTAMPTZ` | **NOT NULL**, Default `now()` | `'2026-08-08 08:00:00+07'` | Waktu pembuatan |
| `updated_at` | `TIMESTAMPTZ` | **NOT NULL**, Default `now()` | `'2026-08-08 08:00:00+07'` | Waktu pembaruan |

---

## 3. Modul 1: CBT Exam & Survey Engine

### Tabel: `exams`
Konfigurasi paket ujian, kuis cepat, dan survei kepuasan/akademik.

| Nama Kolom | Tipe Data | Nullable / Default | Contoh Nilai yang Diisikan | Keterangan & Aturan |
|---|---|---|---|---|
| `id` | `UUID` | **PK**, `gen_random_uuid()` | `'e5d4c3...-...'` | ID unik ujian/survei |
| `title` | `VARCHAR(255)` | **NOT NULL** | `'Penilaian Akhir Semester Matematika Wajib'` | Judul ujian/survei |
| `information` | `TEXT` | Nullable | `'Kerjakan dengan jujur. Waktu pengerjaan 90 menit.'` | Petunjuk umum pengerjaan |
| `pdf_url` | `TEXT` | Nullable | `'https://drive.google.com/file/d/1A2B3C.../view'` | **Link PDF Naskah Soal** (Google Drive / Storage) |
| `duration_minutes` | `SMALLINT` | **NOT NULL**, Default `60` | `90` *(isi 0 jika survei)* | Durasi waktu ujian dalam menit |
| `passing_grade` | `DECIMAL(5,2)` | **NOT NULL**, Default `60.00` | `75.00` | KKM / Nilai ambang batas kelulusan (0–100) |
| `target_kelas` | `VARCHAR(255)` | Default `'all'` | `'XI-IPA-1,XI-IPA-2'` atau `'all'` | Target kelas peserta |
| `created_by` | `UUID` | **NOT NULL, FK → profiles(id)** | `'70a0e0eb-...'` | ID Guru / Admin pembuat ujian |
| `status` | `VARCHAR(20)` | **NOT NULL**, Default `'draft'` | `'published'` | `'draft'`, `'published'`, atau `'closed'` |
| `mode` | `VARCHAR(20)` | **NOT NULL**, Default `'exam'` | `'exam'` | `'exam'` (Ujian), `'quiz'` (Kuis), atau `'survey'` |
| `quiz_timer_type` | `VARCHAR(20)` | Default `'uniform'` | `'independent'` | `'uniform'` (sama per soal), `'independent'` |
| `monitoring_level` | `SMALLINT` | **NOT NULL**, Default `1` | `4` | `0`=Survey, `1`=Casual, `2`=Scout, `3`=Vanguard, `4`=STRIX |
| `question_order` | `VARCHAR(10)` | Default `'ORDER'` | `'SHUFFLE'` | `'ORDER'` (Urut) / `'SHUFFLE'` (Acak) |
| `survey_type` | `VARCHAR(20)` | Nullable | `'scheduled'` | `'one_time'` / `'scheduled'` *(hanya mode survey)* |
| `survey_recurrence` | `VARCHAR(20)` | Nullable | `'weekly'` | `'daily'`, `'weekly'`, `'monthly'` |
| `survey_notify_time` | `VARCHAR(10)` | Nullable | `'19:00'` | Waktu kirim notifikasi reminder |
| `survey_valid_from` | `TIMESTAMPTZ` | Nullable | `'2026-08-10 07:00:00+07'` | Awal jendela pengisian survei |
| `survey_valid_until` | `TIMESTAMPTZ` | Nullable | `'2026-08-17 23:59:59+07'` | Batas akhir pengisian survei |
| `survey_allow_edit` | `BOOLEAN` | **NOT NULL**, Default `false` | `false` | Izinkan siswa mengedit respon survei |
| `default_options_count` | `SMALLINT` | Default `4` | `5` | Jumlah opsi default soal PG/Multi (2 s/d 10: A-D, A-E, dst.) |
| `default_statements_count` | `SMALLINT` | Default `3` | `4` | Jumlah baris pernyataan default soal Benar / Salah |
| `default_matching_count` | `SMALLINT` | Default `3` | `3` | Jumlah pasang default soal Menjodohkan (Matching) |
| `default_sequencing_count` | `SMALLINT` | Default `4` | `4` | Jumlah langkah default soal Mengurutkan (Sequencing) |
| `default_agree_disagree_count` | `SMALLINT` | Default `3` | `3` | Jumlah pernyataan default soal Setuju / Tidak Setuju |
| `default_survey_options_count` | `SMALLINT` | Default `4` | `4` | Jumlah opsi default pertanyaan pilihan survei |
| `default_grid_rows_count` | `SMALLINT` | Default `3` | `3` | Jumlah baris default kisi survei |
| `default_grid_cols_count` | `SMALLINT` | Default `3` | `3` | Jumlah kolom default kisi survei |
| `returnee_token` | `VARCHAR(6)` | Nullable | `'7b3x9a'` | Token masuk kembali tingkat ujian (6 karakter angka & huruf kecil) |
| `created_at` | `TIMESTAMPTZ` | **NOT NULL**, Default `now()` | `'2026-08-08 09:00:00+07'` | Waktu dibuat |
| `updated_at` | `TIMESTAMPTZ` | **NOT NULL**, Default `now()` | `'2026-08-08 09:00:00+07'` | Waktu diupdate |

---

### Tabel: `questions`
Bank butir soal dan kuesioner survei.

| Nama Kolom | Tipe Data | Nullable / Default | Contoh Nilai yang Diisikan | Keterangan & Format JSON |
|---|---|---|---|---|
| `id` | `UUID` | **PK**, `gen_random_uuid()` | `'q1a2b3...-...'` | ID butir soal |
| `exam_id` | `UUID` | **NOT NULL, FK → exams(id)** | `'e5d4c3...-...'` | ID ujian induknya |
| `number` | `SMALLINT` | **NOT NULL** | `1` | Nomor urut soal (1, 2, 3...) |
| `type` | `VARCHAR(30)` | **NOT NULL** | `'MCQ'` | `'MCQ'`, `'COMPLEX_MCQ'`, `'TRUE_FALSE'`, `'MATCHING'`, `'SEQUENCING'`, `'AGREE_DISAGREE'`, `'ESSAY'`, `'SHORT_ANSWER'`, `'PARAGRAPH'`, `'LINEAR_SCALE'`, `'MCQ_GRID'`, `'CHECKBOX_GRID'`, `'CHECKBOXES'`, `'DROPDOWN'` |
| `question_text` | `TEXT` | **NOT NULL**, Default `''` | `'Tentukan nilai dari f(x) = 2x + 5 jika x = 3'` | Teks narasi pertanyaan |
| `image_url` | `TEXT` | Nullable | `'https://drive.google.com/file/d/1X9Y.../view'` | **Link Gambar Soal/Diagram** |
| `options` | `JSONB` | Nullable | `'{"left": {"1": "Indonesia"}, "right": {"A": "Jakarta"}}'` atau `'{"items": [{"id": "s1", "text": "Telur"}]}'` | Objek opsi/premis/pernyataan dalam format JSON |
| `option_images` | `JSONB` | Nullable, Default `'{}'::jsonb` | `'{"A": "https://drive.google.com/...", "B": "https://..."}'` | **Link Gambar per Opsi Jawaban** (rescale otomatis adaptif) |
| `correct_answer` | `JSONB` | Nullable | `'A'` atau `'{"1": "A"}'` atau `'["s1", "s2"]'` atau `'{"stmt_1": "agree"}'` | Kunci jawaban benar (otomatis grading proporsional/penuh) |
| `points` | `DECIMAL(5,2)` | **NOT NULL**, Default `1.00` | `2.50` | Bobot skor jika jawaban benar |
| `variant` | `VARCHAR(5)` | **NOT NULL**, Default `'A'` | `'A'` | Kode paket soal ('A', 'B', dsb.) |
| `time_limit` | `SMALLINT` | Nullable | `45` | Batas waktu per soal dalam detik (Kuis) |
| `scale_min` | `SMALLINT` | Default `1` | `1` | Batas bawah skala likert (Survei) |
| `scale_max` | `SMALLINT` | Default `5` | `5` | Batas atas skala likert (Survei) |
| `scale_min_label` | `VARCHAR(100)` | Nullable | `'Sangat Kurang Puas'` | Label teks batas bawah |
| `scale_max_label` | `VARCHAR(100)` | Nullable | `'Sangat Puas'` | Label teks batas atas |
| `grid_rows` | `JSONB` | Nullable | `'["Kebersihan Kelas", "Kenyamanan Lab"]'` | Daftar baris pertanyaan kisi-kisi |
| `grid_columns` | `JSONB` | Nullable | `'["Kurang", "Cukup", "Baik"]'` | Daftar kolom pilihan kisi-kisi |
| `allow_other` | `BOOLEAN` | **NOT NULL**, Default `false` | `true` | Ada opsi "Lainnya" isian bebas |
| `required` | `BOOLEAN` | **NOT NULL**, Default `true` | `true` | Wajib diisi sebelum submit |
| `created_at` | `TIMESTAMPTZ` | **NOT NULL**, Default `now()` | `'2026-08-08 09:30:00+07'` | Waktu dibuat |

---

### Tabel: `exam_sessions`
Status pengerjaan ujian secara *live* per siswa (autosave & proctoring).

| Nama Kolom | Tipe Data | Nullable / Default | Contoh Nilai yang Diisikan | Keterangan & Format |
|---|---|---|---|---|
| `id` | `UUID` | **PK**, `gen_random_uuid()` | `'s1e2s3...-...'` | ID sesi pengerjaan siswa |
| `student_id` | `UUID` | **NOT NULL, FK → profiles(id)** | `'70a0e0eb-...'` | ID siswa peserta ujian |
| `exam_id` | `UUID` | **NOT NULL, FK → exams(id)** | `'e5d4c3...-...'` | ID ujian yang dikerjakan |
| `variant` | `VARCHAR(5)` | **NOT NULL**, Default `'A'` | `'A'` | Paket soal yang didapat siswa |
| `status` | `VARCHAR(20)` | **NOT NULL**, Default `'active'` | `'active'` | `'active'` (sedang berjalan), `'submitted'` (selesai), `'time_up'`, `'reset'` |
| `answers` | `JSONB` | **NOT NULL**, Default `'{}'` | `'{"1": "A", "2": ["B", "C"], "3": "Penjelasan esai..."}'` | Autosave jawaban siswa real-time |
| `violation_count` | `SMALLINT` | **NOT NULL**, Default `0` | `2` | Jumlah deteksi tab-switch / gaze away |
| `current_question` | `SMALLINT` | **NOT NULL**, Default `1` | `5` | Nomor soal terakhir yang dibuka |
| `end_timestamp` | `TIMESTAMPTZ` | Nullable | `'2026-08-08 11:30:00+07'` | Batas waktu server sesi berakhir |
| `last_sync` | `TIMESTAMPTZ` | **NOT NULL**, Default `now()` | `'2026-08-08 10:45:12+07'` | Heartbeat autosave terakhir |
| `returnee_token_required` | `BOOLEAN` | **NOT NULL**, Default `false` | `true` | Apakah siswa berstatus returnee dan butuh token |
| `returnee_token` | `VARCHAR(6)` | Nullable | `'k49m12'` | Token returnee khusus siswa ini (6 karakter angka & huruf kecil) |
| `returnee_reason` | `VARCHAR(100)` | Nullable | `'Logout terdeteksi'` | Alasan sesi dikunci sebagai returnee |
| `returnee_unlocked_at` | `TIMESTAMPTZ` | Nullable | `'2026-08-08 10:50:00+07'` | Waktu kunci dibuka oleh pengawas atau token |
| `exam_auth_token` | `TEXT` | Nullable | `'ds_172..._a9b8'` | Token autentikasi sesi ujian |
| `created_at` | `TIMESTAMPTZ` | **NOT NULL**, Default `now()` | `'2026-08-08 10:00:00+07'` | Waktu mulai mengerjakan |

---

### Tabel: `results`
Hasil akhir penilaian ujian, rekap skor otomatis, penilaian esai manual, dan pelanggaran.

| Nama Kolom | Tipe Data | Nullable / Default | Contoh Nilai yang Diisikan | Keterangan & Format |
|---|---|---|---|---|
| `id` | `UUID` | **PK**, `gen_random_uuid()` | `'r1e2s3...-...'` | ID hasil ujian |
| `student_id` | `UUID` | **NOT NULL, FK → profiles(id)** | `'70a0e0eb-...'` | ID siswa yang dinilai |
| `exam_id` | `UUID` | **NOT NULL, FK → exams(id)** | `'e5d4c3...-...'` | ID ujian |
| `session_id` | `UUID` | Nullable, **FK → exam_sessions(id)** | `'s1e2s3...-...'` | ID sesi ujian referensi |
| `auto_score` | `DECIMAL(6,2)` | **NOT NULL**, Default `0.00` | `85.00` | Skor dari soal pilihan ganda / objektif |
| `max_auto_score` | `DECIMAL(6,2)` | **NOT NULL**, Default `0.00` | `100.00` | Skor maksimal yang bisa diperoleh |
| `essay_score` | `DECIMAL(6,2)` | **NOT NULL**, Default `0.00` | `15.00` | Skor esai yang diinput manual oleh Guru |
| `violation_count` | `SMALLINT` | **NOT NULL**, Default `0` | `1` | Total pelanggaran anti-cheat |
| `breakdown` | `TEXT` | **NOT NULL**, Default `'[]'` | `'[{"number":1,"status":"correct","earned":2.5,"max":2.5}]'` | Rincian status benar/salah per butir soal (JSON string) |
| `created_at` | `TIMESTAMPTZ` | **NOT NULL**, Default `now()` | `'2026-08-08 11:31:00+07'` | Waktu selesai dinilai |

---

### Tabel: `survey_notifications`
Pengingat notifikasi survei berkala / sekali jalan untuk siswa.

| Nama Kolom | Tipe Data | Nullable / Default | Contoh Nilai yang Diisikan | Keterangan & Aturan |
|---|---|---|---|---|
| `id` | `UUID` | **PK**, `gen_random_uuid()` | `'n1o2t3...-...'` | ID notifikasi |
| `user_id` | `UUID` | **NOT NULL, FK → profiles(id)** | `'70a0e0eb-...'` | ID siswa penerima |
| `exam_id` | `UUID` | **NOT NULL, FK → exams(id)** | `'e5d4c3...-...'` | ID survei yang harus diisi |
| `is_read` | `BOOLEAN` | **NOT NULL**, Default `false` | `false` *(belum dibaca)* / `true` | Status keterbacaan |
| `created_at` | `TIMESTAMPTZ` | **NOT NULL**, Default `now()` | `'2026-08-08 19:00:00+07'` | Waktu notifikasi terkirim |

---

## 4. Modul 2: SIAKAD (Sistem Informasi Akademik)

### Tabel: `academic_marks`
Daftar nilai tugas harian, kuis, UTS, UAS, dan praktikum siswa.

| Nama Kolom | Tipe Data | Nullable / Default | Contoh Nilai yang Diisikan | Keterangan & Aturan |
|---|---|---|---|---|
| `id` | `UUID` | **PK**, `gen_random_uuid()` | `'m1a2r3...-...'` | ID nilai |
| `student_id` | `UUID` | **NOT NULL, FK → profiles(id)** | `'70a0e0eb-...'` | ID Siswa |
| `course_id` | `UUID` | **NOT NULL, FK → lms_courses(id)** | `'c1o2u3...-...'` | ID Mata Pelajaran / Kursus |
| `mark_type` | `VARCHAR(20)` | **NOT NULL** | `'midterm'` | `'assignment'`, `'quiz'`, `'midterm'`, `'final'`, `'practical'` |
| `title` | `VARCHAR(200)` | **NOT NULL** | `'Ulangan Harian Bab 2 Matriks'` | Judul penilaian |
| `score` | `DECIMAL(5,2)` | **NOT NULL** | `88.50` | Nilai yang didapat (0.00 – 100.00) |
| `max_score` | `DECIMAL(5,2)` | **NOT NULL**, Default `100.00` | `100.00` | Nilai maksimum |
| `weight` | `DECIMAL(3,2)` | **NOT NULL**, Default `1.00` | `0.20` | Bobot penilaian terhadap nilai akhir (0.01 – 1.00) |
| `graded_by` | `UUID` | Nullable, **FK → profiles(id)** | `'70a0e0eb-...'` | Guru penilai |
| `graded_at` | `TIMESTAMPTZ` | **NOT NULL**, Default `now()` | `'2026-08-08 14:00:00+07'` | Waktu penilaian |
| `created_at` | `TIMESTAMPTZ` | **NOT NULL**, Default `now()` | `'2026-08-08 14:00:00+07'` | Waktu data dibuat |

---

### Tabel: `report_cards`
Rekapitulasi nilai rapor semester siswa per mata pelajaran.

| Nama Kolom | Tipe Data | Nullable / Default | Contoh Nilai yang Diisikan | Keterangan & Aturan |
|---|---|---|---|---|
| `id` | `UUID` | **PK**, `gen_random_uuid()` | `'r1c2a3...-...'` | ID rapor |
| `student_id` | `UUID` | **NOT NULL, FK → profiles(id)** | `'70a0e0eb-...'` | ID Siswa |
| `course_id` | `UUID` | **NOT NULL, FK → lms_courses(id)** | `'c1o2u3...-...'` | ID Mata Pelajaran |
| `period_id` | `UUID` | **NOT NULL, FK → academic_periods(id)** | `'d9f8e7...-...'` | ID Semester / Periode |
| `final_grade` | `DECIMAL(5,2)` | **NOT NULL** | `91.25` | Angka nilai akhir (0.00 – 100.00) |
| `letter_grade` | `CHAR(2)` | Nullable | `'A'` | Huruf mutu: `'A'`, `'A-'`, `'B+'`, `'B'`, `'B-'`, `'C+'`, `'C'`, `'D'`, `'E'` |
| `gpa_points` | `DECIMAL(3,2)` | Nullable | `4.00` | Bobot IPK skala 4.00 (0.00 – 4.00) |
| `teacher_notes` | `TEXT` | Nullable | `'Sangat aktif berdiskusi dan menguasai materi'` | Catatan evaluasi guru pengampu |
| `status` | `VARCHAR(15)` | **NOT NULL**, Default `'draft'` | `'published'` | `'draft'`, `'published'`, atau `'archived'` |
| `created_at` | `TIMESTAMPTZ` | **NOT NULL**, Default `now()` | `'2026-08-08 15:00:00+07'` | Waktu dibuat |
| `updated_at` | `TIMESTAMPTZ` | **NOT NULL**, Default `now()` | `'2026-08-08 15:00:00+07'` | Waktu pembaruan |

---

### Tabel: `attendance`
Log presensi harian siswa dengan multi-tier verifikasi (L1 Manual, L2 QR/Kode, L3 Biometrik Wajah + GPS Geofence).

| Nama Kolom | Tipe Data | Nullable / Default | Contoh Nilai yang Diisikan | Keterangan & Format |
|---|---|---|---|---|
| `id` | `UUID` | **PK**, `gen_random_uuid()` | `'a1t2t3...-...'` | ID catatan presensi |
| `student_id` | `UUID` | **NOT NULL, FK → profiles(id)** | `'70a0e0eb-...'` | ID Siswa |
| `attendance_date` | `DATE` | **NOT NULL**, Default `CURRENT_DATE` | `'2026-08-08'` | Tanggal presensi (`YYYY-MM-DD`) |
| `check_in` | `TIMESTAMPTZ` | Nullable | `'2026-08-08 06:45:10+07'` | Waktu jam masuk |
| `check_out` | `TIMESTAMPTZ` | Nullable | `'2026-08-08 15:30:22+07'` | Waktu jam pulang |
| `status` | `VARCHAR(15)` | **NOT NULL**, Default `'present'` | `'present'` | `'present'`, `'absent'`, `'late'`, `'excused'`, `'sick'` |
| `check_in_method` | `VARCHAR(20)` | **NOT NULL**, Default `'manual'` | `'face_geo'` | `'manual'` (Officer L1), `'qr_scan'`, `'code_entry'`, `'face_id'`, `'geolocation'`, `'face_geo'` |
| `geo_lat` | `DECIMAL(10,7)` | Nullable | `-6.2087634` | Koordinat Lintang GPS (presisi ~1cm) |
| `geo_lng` | `DECIMAL(10,7)` | Nullable | `106.8455990` | Koordinat Bujur GPS |
| `face_confidence` | `DECIMAL(5,4)` | Nullable | `0.9845` | Tingkat akurasi Face ID (0.0000–1.0000) |
| `device_info` | `JSONB` | Default `'{}'` | `'{"browser": "Chrome", "os": "Android"}'` | Metadata perangkat verifikasi |
| `recorded_by` | `UUID` | Nullable, **FK → profiles(id)** | `'70a0e0eb-...'` | ID Petugas / Guru pencatat presensi |
| `notes` | `TEXT` | Nullable | `'Izin mengikuti lomba olimpiade'` | Alasan jika izin/sakit/terlambat |
| `created_at` | `TIMESTAMPTZ` | **NOT NULL**, Default `now()` | `'2026-08-08 06:45:10+07'` | Waktu pencatatan di database |

---

### Tabel: `violation_logs`
Buku catatan disiplin & tata tertib siswa.

| Nama Kolom | Tipe Data | Nullable / Default | Contoh Nilai yang Diisikan | Keterangan & Aturan |
|---|---|---|---|---|
| `id` | `UUID` | **PK**, `gen_random_uuid()` | `'v1o2l3...-...'` | ID rekam pelanggaran |
| `student_id` | `UUID` | **NOT NULL, FK → profiles(id)** | `'70a0e0eb-...'` | ID Siswa pelaku pelanggaran |
| `reported_by` | `UUID` | Nullable, **FK → profiles(id)** | `'70a0e0eb-...'` | Guru / Staf pelapor |
| `violation_type` | `VARCHAR(50)` | **NOT NULL** | `'tardiness'` | Jenis pelanggaran: `'tardiness'`, `'dress_code'`, `'academic_dishonesty'`, dll. |
| `description` | `TEXT` | **NOT NULL** | `'Terlambat masuk sekolah lebih dari 30 menit'` | Uraian kejadian pelanggaran |
| `severity` | `SMALLINT` | **NOT NULL** | `2` *(1 s/d 10)* | Bobot pelanggaran: 1=Ringan, 5=Sedang/Skors, 10=Dikeluarkan |
| `incident_date` | `DATE` | **NOT NULL**, Default `CURRENT_DATE` | `'2026-08-08'` | Tanggal kejadian (`YYYY-MM-DD`) |
| `resolution` | `TEXT` | Nullable | `'Diberikan pembinaan dan surat peringatan 1'` | Tindak lanjut / sanksi pembinaan |
| `is_resolved` | `BOOLEAN` | **NOT NULL**, Default `false` | `false` | Status kasus: `true` (selesai) / `false` (aktif) |
| `created_at` | `TIMESTAMPTZ` | **NOT NULL**, Default `now()` | `'2026-08-08 08:30:00+07'` | Waktu laporan dicatat |

---

## 5. Modul 3: LMS (Learning Management System)

### Tabel: `lms_courses`
Daftar mata pelajaran / modul pembelajaran yang diampu guru.

| Nama Kolom | Tipe Data | Nullable / Default | Contoh Nilai yang Diisikan | Keterangan & Aturan |
|---|---|---|---|---|
| `id` | `UUID` | **PK**, `gen_random_uuid()` | `'c1o2u3...-...'` | ID mata pelajaran |
| `teacher_id` | `UUID` | **NOT NULL, FK → profiles(id)** | `'70a0e0eb-...'` | Guru pengampu (Role Level 3) |
| `period_id` | `UUID` | Nullable, **FK → academic_periods(id)** | `'d9f8e7...-...'` | Periode semester |
| `course_code` | `VARCHAR(20)` | **NOT NULL, UNIQUE** | `'MTK-XI-2025'` | Kode unik mata pelajaran |
| `course_name` | `VARCHAR(150)` | **NOT NULL** | `'Matematika Wajib Kelas XI'` | Nama mata pelajaran |
| `description` | `TEXT` | Nullable | `'Kalkulus dasar, aljabar linear, dan trigonometri lanjutan'` | Silabus / deskripsi kursus |
| `class_group` | `VARCHAR(30)` | Nullable | `'XI-IPA-1'` | Kelompok kelas sasaran |
| `credit_hours` | `SMALLINT` | **NOT NULL**, Default `2` | `4` *(1 s/d 10)* | Beban SKS / Jam pelajaran per minggu |
| `status` | `VARCHAR(15)` | **NOT NULL**, Default `'active'` | `'active'` | `'active'`, `'archived'`, atau `'draft'` |
| `created_at` | `TIMESTAMPTZ` | **NOT NULL**, Default `now()` | `'2026-08-08 07:30:00+07'` | Waktu dibuat |
| `updated_at` | `TIMESTAMPTZ` | **NOT NULL**, Default `now()` | `'2026-08-08 07:30:00+07'` | Waktu diperbarui |

---

### Tabel: `lms_enrollments`
Junction table relasi Banyak-ke-Banyak (M:N) antara siswa dan mata pelajaran.

| Nama Kolom | Tipe Data | Nullable / Default | Contoh Nilai yang Diisikan | Keterangan & Aturan |
|---|---|---|---|---|
| `id` | `UUID` | **PK**, `gen_random_uuid()` | `'e1n2r3...-...'` | ID pendaftaran siswa di kursus |
| `course_id` | `UUID` | **NOT NULL, FK → lms_courses(id)** | `'c1o2u3...-...'` | ID Mata Pelajaran |
| `student_id` | `UUID` | **NOT NULL, FK → profiles(id)** | `'70a0e0eb-...'` | ID Siswa peserta |
| `enrolled_at` | `TIMESTAMPTZ` | **NOT NULL**, Default `now()` | `'2026-08-08 08:00:00+07'` | Tanggal & jam siswa didaftarkan |
| `status` | `VARCHAR(15)` | **NOT NULL**, Default `'active'` | `'active'` | `'active'` (aktif belajar), `'dropped'` (berhenti), `'completed'` |

---

## 🔒 Ringkasan Hirarki Role Level (RBAC) & Akses Data

| Level | Role | Hak Akses (*Permissions*) |
|---|---|---|
| **Level 4** | **Admin / Superadmin** | **Full CRUD** di seluruh 16 tabel. Kontrol sakelar fitur (`features` & `feature_access`). |
| **Level 3** | **Teacher / Guru** | CRUD pada Ujian, Soal, Sesi, Nilai Siswa, Presensi, dan Kursus miliknya. Read-only pada konfigurasi sistem. |
| **Level 2** | **Officer / Petugas** | Hak input presensi manual L1 (`attendance`), read-only pada profil dan rekap ujian. **Tidak bisa** memodifikasi nilai siswa. |
| **Level 1** | **Student & Parent** | Akses **Read & Write terbatas eksklusif** pada data miliknya sendiri (`student_id = auth.uid()`): ikut ujian, lihat hasil nilai sendiri, dan presensi L2/L3 mandiri. |
