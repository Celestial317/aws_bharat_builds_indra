package org.indra.telemetry;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Minimal JSON reader/writer (objects, arrays, strings, numbers, booleans, null). No dependencies. */
final class Json {
    private Json() {}

    static final class ParseException extends RuntimeException {
        private static final long serialVersionUID = 1L;

        ParseException(String message) { super(message); }
    }

    // ------------------------------------------------------------------ parse
    static Object parse(String text) {
        Parser p = new Parser(text);
        p.skipWs();
        Object value = p.value(0);
        p.skipWs();
        if (p.pos != text.length()) throw new ParseException("Unexpected trailing characters at " + p.pos);
        return value;
    }

    @SuppressWarnings("unchecked")
    static Map<String, Object> parseObject(String text) {
        Object v = parse(text);
        if (!(v instanceof Map)) throw new ParseException("Expected a JSON object");
        return (Map<String, Object>) v;
    }

    private static final class Parser {
        private static final int MAX_DEPTH = 32;
        final String s;
        int pos;

        Parser(String s) { this.s = s; }

        void skipWs() { while (pos < s.length() && Character.isWhitespace(s.charAt(pos))) pos++; }

        char peek() {
            if (pos >= s.length()) throw new ParseException("Unexpected end of input");
            return s.charAt(pos);
        }

        void expect(char c) {
            if (peek() != c) throw new ParseException("Expected '" + c + "' at " + pos);
            pos++;
        }

        Object value(int depth) {
            if (depth > MAX_DEPTH) throw new ParseException("Nesting too deep");
            skipWs();
            char c = peek();
            if (c == '{') return object(depth);
            if (c == '[') return array(depth);
            if (c == '"') return string();
            if (s.startsWith("true", pos)) { pos += 4; return Boolean.TRUE; }
            if (s.startsWith("false", pos)) { pos += 5; return Boolean.FALSE; }
            if (s.startsWith("null", pos)) { pos += 4; return null; }
            return number();
        }

        Map<String, Object> object(int depth) {
            Map<String, Object> out = new LinkedHashMap<>();
            expect('{');
            skipWs();
            if (peek() == '}') { pos++; return out; }
            while (true) {
                skipWs();
                String key = string();
                skipWs();
                expect(':');
                out.put(key, value(depth + 1));
                skipWs();
                if (peek() == ',') { pos++; continue; }
                expect('}');
                return out;
            }
        }

        List<Object> array(int depth) {
            List<Object> out = new ArrayList<>();
            expect('[');
            skipWs();
            if (peek() == ']') { pos++; return out; }
            while (true) {
                out.add(value(depth + 1));
                skipWs();
                if (peek() == ',') { pos++; continue; }
                expect(']');
                return out;
            }
        }

        String string() {
            expect('"');
            StringBuilder sb = new StringBuilder();
            while (true) {
                char c = peek();
                pos++;
                if (c == '"') return sb.toString();
                if (c != '\\') { sb.append(c); continue; }
                char e = peek();
                pos++;
                switch (e) {
                    case '"', '\\', '/' -> sb.append(e);
                    case 'b' -> sb.append('\b');
                    case 'f' -> sb.append('\f');
                    case 'n' -> sb.append('\n');
                    case 'r' -> sb.append('\r');
                    case 't' -> sb.append('\t');
                    case 'u' -> {
                        if (pos + 4 > s.length()) throw new ParseException("Bad unicode escape");
                        sb.append((char) Integer.parseInt(s.substring(pos, pos + 4), 16));
                        pos += 4;
                    }
                    default -> throw new ParseException("Bad escape \\" + e);
                }
            }
        }

        Double number() {
            int start = pos;
            while (pos < s.length() && "+-0123456789.eE".indexOf(s.charAt(pos)) >= 0) pos++;
            if (start == pos) throw new ParseException("Unexpected character '" + peek() + "' at " + pos);
            try {
                return Double.valueOf(s.substring(start, pos));
            } catch (NumberFormatException ex) {
                throw new ParseException("Bad number at " + start);
            }
        }
    }

    // ------------------------------------------------------------------ write
    static String write(Object value) {
        StringBuilder sb = new StringBuilder();
        write(sb, value);
        return sb.toString();
    }

    private static void write(StringBuilder sb, Object v) {
        if (v == null) {
            sb.append("null");
        } else if (v instanceof String str) {
            quote(sb, str);
        } else if (v instanceof Boolean b) {
            sb.append(b);
        } else if (v instanceof Double d) {
            sb.append(d.isNaN() || d.isInfinite() ? "null" : trimNumber(d));
        } else if (v instanceof Number n) {
            sb.append(n);
        } else if (v instanceof Map<?, ?> m) {
            sb.append('{');
            boolean first = true;
            for (Map.Entry<?, ?> e : m.entrySet()) {
                if (!first) sb.append(',');
                first = false;
                quote(sb, String.valueOf(e.getKey()));
                sb.append(':');
                write(sb, e.getValue());
            }
            sb.append('}');
        } else if (v instanceof Iterable<?> it) {
            sb.append('[');
            boolean first = true;
            for (Object o : it) {
                if (!first) sb.append(',');
                first = false;
                write(sb, o);
            }
            sb.append(']');
        } else {
            quote(sb, v.toString());
        }
    }

    private static String trimNumber(double d) {
        if (d == Math.rint(d) && Math.abs(d) < 1e15) return Long.toString((long) d);
        return Double.toString(Math.round(d * 1000.0) / 1000.0);
    }

    private static void quote(StringBuilder sb, String s) {
        sb.append('"');
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            switch (c) {
                case '"' -> sb.append("\\\"");
                case '\\' -> sb.append("\\\\");
                case '\n' -> sb.append("\\n");
                case '\r' -> sb.append("\\r");
                case '\t' -> sb.append("\\t");
                default -> {
                    if (c < 0x20) sb.append(String.format("\\u%04x", (int) c));
                    else sb.append(c);
                }
            }
        }
        sb.append('"');
    }
}
