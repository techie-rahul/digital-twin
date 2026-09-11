# Error Testing & Fuzzing Test Suite

This folder contains a curated suite of random, malformed, invalid, and adversarial files specifically created to test error handling, input validation, parser stability, and boundary edge cases on web applications and APIs.

## Test File Catalog

| File Name | Test Target | Expected / Potential Error |
| :--- | :--- | :--- |
| `01_syntax_error_malformed.json` | JSON Syntax Parser | `400 Bad Request`, `JSON.parse` SyntaxError (unexpected token, unclosed array/object). |
| `02_completely_random_data.json` | Schema & Domain Validation | Completely unrelated pizza order data. Tests if the app crashes on undefined properties (e.g. `cannot read property 'assets' of undefined`). |
| `03_type_confusion_and_nulls.json` | Type Safety & Null Handling | Extreme numbers, `null` where objects/strings expected, booleans instead of arrays. Tests for `NullPointerException` or unhandled type cast errors. |
| `04_security_fuzzing_xss_sqli.json` | Sanitization & Injection Defense | Injected `<script>` tags, image error handlers, SQL injection strings, template injection `{{7*7}}`, and path traversal. Tests if UI executes XSS or backend leaks SQL errors. |
| `05_malicious_broken.csv` | CSV Parser & Formula Injection | CSV formula injection (`=cmd|...`), broken unclosed quotes, jagged column counts per row, and emoji unicode edge cases. |
| `06_huge_stress_payload.json` | Memory & Performance Stress | 60,000 character string, 120 levels of nested objects, and a 5,000-item array. Tests `413 Payload Too Large`, recursion limits, and frontend render freezing. |
| `07_empty_zero_byte.json` | Empty File / Zero-Byte Handling | Empty 0-byte file. Tests for unexpected EOF, unhandled division by zero, or crash on empty buffer. |
| `08_fake_image_file.png` | MIME Type & Extension Validation | Plain text file disguised as a `.png`. Tests if server validates magic bytes or blindly trusts the file extension. |
| `09_broken_yaml.yaml` | YAML Parser & Indentation Rules | Tab characters used for indentation, duplicate keys, and unclosed multiline strings. Tests YAML parser exception handling. |
| `10_corrupted_binary_garbage.bin` | Binary Encoding & Charset Handler | Raw non-UTF-8 bytes and null bytes. Tests UTF-8 decoder failure (`UnicodeDecodeError` / corrupt character replacement). |
| `11_xml_bomb_attempt.xml` | XML Entity Expansion / DoS | Entity expansion test (Billion Laughs miniature). Tests if XML parser disables external DTD / entity expansion. |
