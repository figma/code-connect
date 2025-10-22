package com.figma.code.connect.models

import kotlin.test.Test
import kotlin.test.assertEquals

/**
 * Tests for escapeJavaScriptString function which escapes strings for use in
 * JavaScript single-quoted string literals (used in enum value mappings).
 */
class PropertyMappingTest {
    @Test
    fun `escapeJavaScriptString handles basic strings`() {
        assertEquals("hello", escapeJavaScriptString("hello"))
        assertEquals("hello world", escapeJavaScriptString("hello world"))
    }

    @Test
    fun `escapeJavaScriptString escapes backslashes`() {
        assertEquals("\\\\", escapeJavaScriptString("\\"))
        assertEquals("\\\\n", escapeJavaScriptString("\\n"))
        assertEquals("\\\\\\\\", escapeJavaScriptString("\\\\"))
    }

    @Test
    fun `escapeJavaScriptString escapes single quotes`() {
        assertEquals("\\'", escapeJavaScriptString("'"))
        assertEquals("don\\'t", escapeJavaScriptString("don't"))
        assertEquals("\\'single\\' quotes", escapeJavaScriptString("'single' quotes"))
    }

    @Test
    fun `escapeJavaScriptString escapes double quotes`() {
        assertEquals("\\\"", escapeJavaScriptString("\""))
        assertEquals("say \\\"hello\\\"", escapeJavaScriptString("say \"hello\""))
    }

    @Test
    fun `escapeJavaScriptString escapes backticks`() {
        assertEquals("\\`", escapeJavaScriptString("`"))
        assertEquals("\\`backtick\\`", escapeJavaScriptString("`backtick`"))
    }

    @Test
    fun `escapeJavaScriptString escapes newlines`() {
        assertEquals("\\n", escapeJavaScriptString("\n"))
        assertEquals("line1\\nline2", escapeJavaScriptString("line1\nline2"))
        assertEquals("\\r", escapeJavaScriptString("\r"))
        assertEquals("\\r\\n", escapeJavaScriptString("\r\n"))
    }

    @Test
    fun `escapeJavaScriptString escapes tabs`() {
        assertEquals("\\t", escapeJavaScriptString("\t"))
        assertEquals("hello\\tworld", escapeJavaScriptString("hello\tworld"))
    }

    @Test
    fun `escapeJavaScriptString escapes control characters`() {
        assertEquals("\\b", escapeJavaScriptString("\b"))
        assertEquals("\\f", escapeJavaScriptString("\u000C"))
    }

    @Test
    fun `escapeJavaScriptString escapes null bytes`() {
        assertEquals("\\u0000", escapeJavaScriptString("\u0000"))
        assertEquals("test\\u0000null", escapeJavaScriptString("test\u0000null"))
    }

    @Test
    fun `escapeJavaScriptString escapes Unicode line terminators`() {
        assertEquals("\\u2028", escapeJavaScriptString("\u2028"))
        assertEquals("\\u2029", escapeJavaScriptString("\u2029"))
        assertEquals("line1\\u2028line2", escapeJavaScriptString("line1\u2028line2"))
    }

    @Test
    fun `escapeJavaScriptString handles complex XSS attempts`() {
        // XSS with quotes
        assertEquals(
            "</div><script>alert(1)</script><div>",
            escapeJavaScriptString("</div><script>alert(1)</script><div>")
        )
        
        // XSS with quotes inside
        assertEquals(
            "\\'; alert(\\'xss\\'); var x=\\'",
            escapeJavaScriptString("'; alert('xss'); var x='")
        )
        
        // Mixed quotes
        assertEquals(
            "\\\"; alert(1); //",
            escapeJavaScriptString("\"; alert(1); //")
        )
    }

    @Test
    fun `escapeJavaScriptString handles Compose code with quotes`() {
        val input = """
            ProfilePicture(
                semanticText = "Bob",
                colors = Colors.Orange,
            )
        """.trimIndent()
        
        val expected = """
            ProfilePicture(
                semanticText = \"Bob\",
                colors = Colors.Orange,
            )
        """.trimIndent().replace("\n", "\\n")
        
        assertEquals(expected, escapeJavaScriptString(input))
    }

    @Test
    fun `escapeJavaScriptString handles empty string`() {
        assertEquals("", escapeJavaScriptString(""))
    }

    @Test
    fun `escapeJavaScriptString handles emoji`() {
        assertEquals("Test 🎉", escapeJavaScriptString("Test 🎉"))
        assertEquals("💩", escapeJavaScriptString("💩"))
    }

    @Test
    fun `escapeJavaScriptString handles multiple escapes in order`() {
        // Ensure backslashes are escaped first to avoid double-escaping
        val input = "\\n\n"  // Literal backslash-n, then newline
        val expected = "\\\\n\\n"  // Should become: \\n (escaped backslash-n) + \n (escaped newline)
        assertEquals(expected, escapeJavaScriptString(input))
    }

    @Test
    fun `escapeJavaScriptString handles HTML entities`() {
        assertEquals("&lt;div&gt;&amp;&quot;", escapeJavaScriptString("&lt;div&gt;&amp;&quot;"))
    }

    @Test
    fun `escapeJavaScriptString handles regex patterns`() {
        // Note: $ doesn't need escaping in single-quoted strings (only in template literals)
        assertEquals("[\\\\d+.$(){}]", escapeJavaScriptString("[\\d+.$(){}]"))
    }

    @Test
    fun `valueMappingToFunctionParamJs escapes enum values`() {
        val mapping = mapOf(
            "\"Key1\"" to "value with 'quotes'",
            "\"Key2\"" to "value\nwith\nnewlines"
        )
        
        val result = valueMappingToFunctionParamJs(mapping)
        
        // Should escape the values
        assert(result.contains("value with \\'quotes\\'"))
        assert(result.contains("value\\nwith\\nnewlines"))
    }
}

