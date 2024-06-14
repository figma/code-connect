
import androidx.compose.foundation.layout.Box
import androidx.compose.runtime.Composable
import com.figma.code.connect.Figma
import com.figma.code.connect.FigmaConnect
import com.figma.code.connect.FigmaProperty
import com.figma.code.connect.FigmaType
import com.figma.code.connect.FigmaVariant

@FigmaConnect(url="http://figma.com/component1")
@FigmaVariant("some variant", "darkmode") // Multiple can be applied.
@FigmaVariant("other variant", "blue")
class ButtonDoc {

    @FigmaProperty(FigmaType.Text, "Label")
    val text = "Click me txt"

    @FigmaProperty(FigmaType.Boolean, "Enabled")
    val enabled = false

    // Example of boolean with mapping"
    @FigmaProperty(FigmaType.Boolean, "HasBorder")
    val borderStyle = Figma.mapping(
        true to BorderStyle.bordered,
        false to BorderStyle.borderless
    )

    @FigmaProperty(FigmaType.Instance, "Icon")
    val icon : @Composable () -> Unit = { IconComponent() }

    @FigmaChildren("Row 1", "Row 2")
    val children: @Composable () -> Unit = {}

    @FigmaProperty(FigmaType.Enum, "button_type")
    val type: ButtonType = Figma.mapping(
        "Primary" to ButtonType.Primary,
        "Secondary" to ButtonType.Secondary
    )

    @Composable
    fun Component2() {
        ButtonComponent(
            type = type,
            text = text,
            borderStyle = borderStyle,
            enabled = enabled,
            icon = icon,
            contents = {
                children
            }
        )
    }
}


// Test components below
@Composable
fun ButtonComponent(
    type: ButtonType,
    text: String,
    borderStyle: BorderStyle,
    enabled: Boolean,
    icon: @Composable () -> Unit,
){}


@Composable
fun IconComponent() {
    Box() {
    }
}

