# SystemView Event Descriptions

This directory contains description files for custom events used with SEGGER SystemView tracing. Each description file is automatically parsed during the pre-build step to generate C header files with enumerated event IDs.

## SYSVIEW_Peripherals.txt

This file defines custom peripheral event IDs that can be logged in SystemView traces. The format is:

```
ID    EventName                   Description
0     Terminal_Command_Process    cmd=%s
1     Terminal_Character          character=%s
```

### Auto-Generation of C Header

During the **pre-build** step, the script `Scripts/generate_sysview_peripherals.py` automatically parses this file and generates:

```
Drivers/SYSVIEW_PERIPHERAL_IDS.h
```

This header file contains C macro definitions that can be used in your code:

```c
#include "SYSVIEW_PERIPHERAL_IDS.h"

// Example usage
SEGGER_SYSVIEW_RecordU32(Terminal_Command_Process, command_id);
SEGGER_SYSVIEW_RecordU32(Terminal_Character, character);
```

### Adding New Events

To add new peripheral events:

1. Edit `SYSVIEW_Peripherals.txt` and add your event:
   ```
   2     MyNewEvent         value=%u
   ```

2. Rebuild the project - the header will be automatically regenerated

3. Use the new event in your code:
   ```c
   SEGGER_SYSVIEW_RecordU32(MyNewEvent, my_value);
   ```

### Manual Generation

To manually regenerate the header (without rebuilding the entire project):

```cmd
python Scripts\generate_sysview_peripherals.py
```

### File Format Rules

- Lines starting with `#` are comments
- Empty lines are ignored
- Each event line format: `<ID> <Name> <Description>`
  - **ID**: Numeric identifier (must be unique)
  - **Name**: C-style identifier (will become macro name)
  - **Description**: Format string for SystemView (optional)

### Notes

- The generated header file (`Drivers/SYSVIEW_PERIPHERAL_IDS.h`) is **auto-generated** and should not be edited manually
- The header is added to `.gitignore` since it's generated during build
- The header includes a count macro `SYSVIEW_PERIPHERAL_COUNT` with the total number of events
- For more information on SystemView, see: https://www.segger.com/products/development-tools/systemview/

## Integration with SystemView

To view these custom events in SystemView:

1. Configure SystemView with the description file:
   - In SystemView, go to **File → Load Description File**
   - Select `SYSVIEW_Peripherals.txt`

2. Record your trace (either live or from coredump)

3. The custom events will appear with their names in the SystemView timeline

## Example

**SYSVIEW_Peripherals.txt:**
```
0     UART_TX_Start       bytes=%u
1     UART_TX_Complete    bytes=%u
2     SPI_Transfer        length=%u
```

**Generated Header (Drivers/SYSVIEW_PERIPHERAL_IDS.h):**
```c
#define UART_TX_Start      0  /* bytes=%u */
#define UART_TX_Complete   1  /* bytes=%u */
#define SPI_Transfer       2  /* length=%u */
#define SYSVIEW_PERIPHERAL_COUNT  3
```

**Usage in Code:**
```c
#include "SYSVIEW_PERIPHERAL_IDS.h"

void HAL_UART_TxCpltCallback(UART_HandleTypeDef *huart) {
    SEGGER_SYSVIEW_RecordU32(UART_TX_Complete, tx_buffer_size);
}
```

---

## SYSVIEW_BLE.txt

This file defines BLE/network stack event IDs for SystemView tracing. The format supports optional return value annotations:

```
ID    EventName           [Description]  [| ReturnInfo]
0     IP_Init
250   connect             hSock=%d pSockAddr=%p AddrLen=%d | Returns %d
```

### Auto-Generation of C Header

During the **pre-build** step, the script `Scripts/generate_sysview_ble.py` automatically parses this file and generates:

```
Drivers/SYSVIEW_BLE_IDS.h
```

This header file contains C macro definitions:

```c
#include "SYSVIEW_BLE_IDS.h"

// Example usage
SEGGER_SYSVIEW_RecordU32(IP_Init, 0);
SEGGER_SYSVIEW_RecordU32(connect, socket_handle);
```

### Adding New Events

To add new BLE events:

1. Edit `SYSVIEW_BLE.txt` and add your event:
   ```
   526   MyBLEEvent         connection=%u | Returns %d
   ```

2. Rebuild the project - the header will be automatically regenerated

3. Use the new event in your code:
   ```c
   SEGGER_SYSVIEW_RecordU32(MyBLEEvent, connection_id);
   ```

### Manual Generation

To manually regenerate the header:

```cmd
python Scripts\generate_sysview_ble.py
```

---

## Summary of Auto-Generated Headers

| Description File | Generator Script | Output Header |
|-----------------|------------------|---------------|
| `SYSVIEW_Peripherals.txt` | `generate_sysview_peripherals.py` | `Drivers/SYSVIEW_PERIPHERAL_IDS.h` |
| `SYSVIEW_BLE.txt` | `generate_sysview_ble.py` | `Drivers/SYSVIEW_BLE_IDS.h` |

All headers are:
- **Auto-generated** during the pre-build step
- Added to `.gitignore` (not committed to version control)
- Include header guards and C++ compatibility
- Contain a count macro for the total number of events
