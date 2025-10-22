package com.figma.code.connect

import kotlin.test.Test
import kotlin.test.assertEquals

/**
 * Tests for JSTemplateCreator.escapeForTemplateLiteral function which escapes strings
 * for safe embedding in JavaScript template literals (used in the component template body).
 */
class JSTemplateCreatorTest {
    private val creator = JSTemplateCreator()

    @Test
    fun `escapeForTemplateLiteral handles basic strings`() {
        assertEquals("hello", creator.escapeForTemplateLiteral("hello"))
        assertEquals("hello world", creator.escapeForTemplateLiteral("hello world"))
    }

    @Test
    fun `escapeForTemplateLiteral escapes backslashes`() {
        assertEquals("\\\\", creator.escapeForTemplateLiteral("\\"))
        assertEquals("\\\\n", creator.escapeForTemplateLiteral("\\n"))
        assertEquals("\\\\\\\\", creator.escapeForTemplateLiteral("\\\\"))
    }

    @Test
    fun `escapeForTemplateLiteral escapes backticks`() {
        assertEquals("\\`", creator.escapeForTemplateLiteral("`"))
        assertEquals("\\`backtick\\`", creator.escapeForTemplateLiteral("`backtick`"))
        assertEquals("code with \\`backticks\\`", creator.escapeForTemplateLiteral("code with `backticks`"))
    }

    @Test
    fun `escapeForTemplateLiteral escapes dollar signs`() {
        assertEquals("\\$", creator.escapeForTemplateLiteral("$"))
        assertEquals("\\${'$'}{var}", creator.escapeForTemplateLiteral("${'$'}{var}"))
        assertEquals("\\${'$'}{injection}", creator.escapeForTemplateLiteral("${'$'}{injection}"))
    }

    @Test
    fun `escapeForTemplateLiteral escapes template expressions`() {
        // User's literal ${'$'}{...} should be escaped
        assertEquals("val x = \\${'$'}{template}", creator.escapeForTemplateLiteral("val x = ${'$'}{template}"))
        assertEquals("\\${'$'}{injection} and \\${'$'}{var}", creator.escapeForTemplateLiteral("${'$'}{injection} and ${'$'}{var}"))
    }

    @Test
    fun `escapeForTemplateLiteral escapes control characters`() {
        assertEquals("\\b", creator.escapeForTemplateLiteral("\b"))
        assertEquals("\\f", creator.escapeForTemplateLiteral("\u000C"))
        assertEquals("test\\bbackspace", creator.escapeForTemplateLiteral("test\bbackspace"))
    }

    @Test
    fun `escapeForTemplateLiteral escapes null bytes`() {
        assertEquals("\\u0000", creator.escapeForTemplateLiteral("\u0000"))
        assertEquals("test\\u0000null", creator.escapeForTemplateLiteral("test\u0000null"))
    }

    @Test
    fun `escapeForTemplateLiteral escapes Unicode line terminators`() {
        assertEquals("\\u2028", creator.escapeForTemplateLiteral("\u2028"))
        assertEquals("\\u2029", creator.escapeForTemplateLiteral("\u2029"))
        assertEquals("line1\\u2028line2", creator.escapeForTemplateLiteral("line1\u2028line2"))
    }

    @Test
    fun `escapeForTemplateLiteral handles XSS attempts`() {
        // Script injection attempts
        assertEquals(
            "</script><svg onload=alert(1)>",
            creator.escapeForTemplateLiteral("</script><svg onload=alert(1)>")
        )
        
        // Template literal injection
        assertEquals(
            "\\`backtick\\` and \\\\\\${'$'}{template}",
            creator.escapeForTemplateLiteral("`backtick` and \\${'$'}{template}")
        )
        
        // Comment-based injection
        assertEquals(
            "/* </script><svg onload=alert(1)> */",
            creator.escapeForTemplateLiteral("/* </script><svg onload=alert(1)> */")
        )
    }

    @Test
    fun `escapeForTemplateLiteral handles Compose code with special chars`() {
        val input = """
            val inject = "`backtick` and ${'$'}{template}"
            SimpleCard(
                onClick = { /* callback */ }
            )
        """.trimIndent()
        
        val result = creator.escapeForTemplateLiteral(input)
        
        // Backticks should be escaped
        assert(result.contains("\\`backtick\\`"))
        // ${'$'}{} should be escaped
        assert(result.contains("\\${'$'}{template}"))
    }

    @Test
    fun `escapeForTemplateLiteral handles empty string`() {
        assertEquals("", creator.escapeForTemplateLiteral(""))
    }

    @Test
    fun `escapeForTemplateLiteral handles emoji`() {
        assertEquals("Test 🎉", creator.escapeForTemplateLiteral("Test 🎉"))
        assertEquals("💩", creator.escapeForTemplateLiteral("💩"))
    }

    @Test
    fun `escapeForTemplateLiteral preserves newlines and tabs`() {
        // Note: Unlike escapeJavaScriptString, this function does NOT escape \n and \t
        // because they're valid in template literals and should be preserved
        assertEquals("line1\nline2", creator.escapeForTemplateLiteral("line1\nline2"))
        assertEquals("tab\there", creator.escapeForTemplateLiteral("tab\there"))
    }

    @Test
    fun `escapeForTemplateLiteral handles multiple escapes in order`() {
        // Ensure backslashes are escaped first
        val input = "\\`${'$'}{var}`"  // Backslash-backtick, ${'$'}{var}, backtick
        val expected = "\\\\\\`\\${'$'}{var}\\`"  // Should escape all properly
        assertEquals(expected, creator.escapeForTemplateLiteral(input))
    }

    @Test
    fun `escapeForTemplateLiteral handles complex nested cases`() {
        // Backslash before dollar sign
        val input = "\\${'$'}{var}"  // Backslash + ${'$'}{var}
        val expected = "\\\\\\${'$'}{var}"  // \\ + \${'$'}{var}
        assertEquals(expected, creator.escapeForTemplateLiteral(input))
    }

    @Test
    fun `escapeForTemplateLiteral handles all special chars together`() {
        val input = "\\`${'$'}{test}\b\u000C\u0000\u2028\u2029"
        val result = creator.escapeForTemplateLiteral(input)
        
        assert(result.contains("\\\\"))  // Backslash
        assert(result.contains("\\`"))   // Backtick
        assert(result.contains("\\$"))  // Template expression
        assert(result.contains("\\b"))   // Backspace
        assert(result.contains("\\f"))   // Form feed
        assert(result.contains("\\u0000"))  // Null byte
        assert(result.contains("\\u2028"))  // Line separator
        assert(result.contains("\\u2029"))  // Paragraph separator
    }

    @Test
    fun `escapeForTemplateLiteral handles real Compose XSS test case`() {
        val input = """
            val inject = "`backtick` and ${'$'}{template} and '; alert('xss'); //'"
            SimpleCard(
                title = title + "</div><script>alert(1)</script><div>"
            )
        """.trimIndent()
        
        val result = creator.escapeForTemplateLiteral(input)
        
        // All dangerous characters should be escaped
        assert(result.contains("\\`backtick\\`"))
        assert(result.contains("\\${'$'}{template}"))
        // Script tags are preserved (they're just text in Kotlin strings)
        assert(result.contains("<script>"))
    }
}

