import androidx.compose.runtime.Composable
import com.figma.code.connect.Figma
import com.figma.code.connect.FigmaConnect
import com.figma.code.connect.FigmaProperty
import com.figma.code.connect.FigmaType
import kotlin.Boolean
import kotlin.String
import kotlin.Unit.Unit

@FigmaConnect("https://www.figma.com/file/e0pacvsdruHTI949l24Oxofe/FCC-Test-Component?node-id=1-39")
public class TestInstanceComponentDoc {
    @FigmaProperty(FigmaType.Enum, "Color")
    public val color: String = Figma.mapping(
        "Default" to "Default",
        "Red" to "Red",
    )

    @FigmaProperty(FigmaType.Text, "name")
    public val name: String = "Click me!"

    @FigmaProperty(FigmaType.Boolean, "isDisabled")
    public val isDisabled: Boolean = false

    @FigmaProperty(FigmaType.Instance, "icon")
    public val icon: @Composable () -> Unit = {}

    @Composable
    public fun ComponentExample() {
        /* Add your component code here. */
    }
}
