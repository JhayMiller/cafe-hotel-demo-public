# Controles antifraude — El vuelo del cóndor

## Regla de negocio

Una visita de mesa puede recibir una sola partida. Dividir la cuenta, crear varios pedidos, usar varios teléfonos o cambiar entre los modos Individual y Amigos no crea nuevas partidas. Caja confirma el pago, la cantidad real de personas y el modo antes de emitir la autorización.

En mostrador, donde no existe una mesa, solo se permite el modo Individual. Conserva el límite de 24 horas por cliente o dispositivo y exige una autorización de Caja por pedido pagado.

## Amenazas y controles

| Intento de abuso | Control aplicado |
| --- | --- |
| Tres personas seleccionan seis jugadores | La cantidad ya no se recibe del teléfono. Caja registra las personas presentes y Amigos usa exactamente esa cifra. |
| Una mesa de cuatro divide la cuenta en cuatro pedidos | Los pedidos de una misma mesa se asocian a una visita activa; la visita admite una sola autorización. |
| La mesa juega Individual y luego Amigos | El primer modo emitido consume la única autorización de la visita. |
| Copian el enlace o lo abren en otro teléfono | El pedido solo crea una sesión y la sesión queda ligada al primer dispositivo mediante un hash. |
| Abren varias pestañas al mismo tiempo | Bloqueos transaccionales y restricciones únicas permiten una sola sesión y un intento por turno. |
| Recargan cuando el puntaje es bajo | Un intento iniciado no puede reiniciarse; queda registrado aunque no se complete y la sesión vence. |
| Alteran el puntaje desde las herramientas del navegador | El cliente ya no envía un puntaje aceptable. Envía los tiempos de los toques y el servidor repite la partida con la misma semilla para calcular el resultado. |
| Alteran el reloj o la duración | El servidor compara la repetición con su propia hora de inicio y rechaza diferencias. |
| Reutilizan una petición ganadora | Cada intento usa un token firmado, un nonce y un estado de un solo uso. |
| Reutilizan un código de premio | Los códigos son únicos y Caja los cambia de disponible a usado en una operación atómica. |
| Inventan pedidos o marcan pagos desde el cliente | La autorización exige un pedido real con el subpedido de café marcado como pagado y una sesión de personal con rol Caja o Administración. |
| Un empleado emite autorizaciones indebidas | Cada autorización conserva el usuario que la emitió; los eventos sospechosos quedan auditables. |
| Cambian o borran el identificador del dispositivo | Los límites principales también dependen del pedido, cliente y visita de mesa. El dispositivo es una señal adicional. |
| Una mesa nueva hereda el bloqueo de la anterior | La visita vence a las cuatro horas; Caja dispone además de una operación autenticada para cerrarla. |

## Riesgos residuales y siguiente nivel

Una persona técnicamente avanzada podría automatizar una secuencia válida de toques. El impacto queda limitado por pedido, visita, identidad, vencimiento y topes de cada beneficio. Antes de aumentar el valor económico de los premios conviene añadir verificación del teléfono del cliente, un presupuesto diario configurable de recompensas, alertas por tasas anormales y revisión administrativa de premios de alto valor.

El código del juego no sustituye la comprobación física de Caja. La pantalla de autorización exige confirmar cuántas personas están presentes; esa cifra forma parte del registro de auditoría de la visita.
