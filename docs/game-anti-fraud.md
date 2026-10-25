# Controles antifraude — El vuelo del cóndor

## Regla de negocio

Una visita de mesa puede recibir una sola partida. Dividir la cuenta, crear varios pedidos, usar varios teléfonos o cambiar entre los modos Individual y Amigos no crea nuevas partidas. La partida queda disponible automáticamente cuando el pedido de café está pagado; el personal no tiene que autorizarla.

El servidor evalúa si la cantidad declarada de jugadores es compatible con las porciones individuales del pedido pagado, con un tope técnico de 20. Cada producto guarda un tipo de consumo (`bebida`, `pastelería`, `plato`, `producto de paquete`, `otro` o `no cuenta`) y cuántas personas representa cada unidad. Estos valores se copian al pedido para que una edición posterior de la carta no cambie la evidencia.

La regla estima personas sin contar dos veces a quien pide bebida y alimento: `personas respaldadas = mayor entre bebidas y suma de pastelería + platos + productos de paquete + otros alimentos`. La coincidencia es exacta cuando bebidas y alimentos igualan la cantidad declarada. Se considera alta cuando el mayor bloque coincide; por ejemplo, tres bebidas, cuatro productos de pastelería y un producto de paquete respaldan cinco jugadores. Si se declaran cinco jugadores con solo dos bebidas y dos productos de pastelería, se rechaza porque el patrón respalda dos personas.

En mostrador, donde no existe una mesa, solo se permite el modo Individual. Conserva el límite de 24 horas por cliente o dispositivo.

## Amenazas y controles

| Intento de abuso | Control aplicado |
| --- | --- |
| Un pedido pequeño intenta abrir ocho turnos | El teléfono propone la cantidad, pero el servidor la compara con el cupo calculado del pedido y rechaza cualquier exceso. |
| Tres bebidas, cuatro productos de pastelería y un paquete; eligen cinco jugadores | Se permite: las ocho porciones pueden distribuirse entre cinco personas sin dejar a nadie sin consumo. |
| Dos bebidas y dos productos de pastelería; eligen cinco jugadores | Se rechaza: el pedido solo respalda cuatro personas y la interfaz pide corregir la cantidad. |
| Una mesa de cuatro divide la cuenta en cuatro pedidos | Los pedidos de una misma mesa se asocian a una visita activa; la visita admite una sola autorización. |
| La mesa juega Individual y luego Amigos | El primer modo emitido consume la única autorización de la visita. |
| Copian el enlace o lo abren en otro teléfono | El pedido solo crea una sesión y la sesión queda ligada al primer dispositivo mediante un hash. |
| Abren varias pestañas al mismo tiempo | Bloqueos transaccionales y restricciones únicas permiten una sola sesión y un intento por turno. |
| Recargan cuando el puntaje es bajo | Un intento iniciado no puede reiniciarse; queda registrado aunque no se complete y la sesión vence. |
| Alteran el puntaje desde las herramientas del navegador | El cliente ya no envía un puntaje aceptable. Envía los tiempos de los toques y el servidor repite la partida con la misma semilla para calcular el resultado. |
| Alteran el reloj o la duración | El servidor compara la repetición con su propia hora de inicio y rechaza diferencias. |
| Reutilizan una petición ganadora | Cada intento usa un token firmado, un nonce y un estado de un solo uso. |
| Reutilizan un código de premio | Los códigos son únicos y Caja los cambia de disponible a usado en una operación atómica. |
| Inventan pedidos o marcan pagos desde el cliente | La creación de sesión exige un pedido real y el subpedido de café marcado como pagado en la base de datos. |
| Alteran la carta después de pagar | El grupo y las unidades de juego se guardan como una copia inmutable en cada línea del pedido. |
| Cambian o borran el identificador del dispositivo | Los límites principales también dependen del pedido, cliente y visita de mesa. El dispositivo es una señal adicional. |
| Una mesa nueva hereda el bloqueo de la anterior | La visita vence a las cuatro horas; Caja dispone además de una operación autenticada para cerrarla. |

## Riesgos residuales y siguiente nivel

Una persona técnicamente avanzada podría automatizar una secuencia válida de toques. El impacto queda limitado por pedido, visita, identidad, vencimiento y topes de cada beneficio. Antes de aumentar el valor económico de los premios conviene añadir verificación del teléfono del cliente, un presupuesto diario configurable de recompensas, alertas por tasas anormales y revisión administrativa de premios de alto valor.

La inferencia por consumo reduce la intervención del personal, pero no demuestra cuántas personas están físicamente sentadas. El control limita el abuso económicamente: nunca concede más turnos que el mayor grupo de consumo pagado y mantiene una sola partida por mesa durante la visita.
