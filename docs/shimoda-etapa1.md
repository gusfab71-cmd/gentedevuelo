# Shimoda — Módulo aeronáutico, etapa 1

Módulo de cálculo y explicación meteorológica **sin acceso a datos en vivo**.

Incluye:
- Cobertura nubosa: FEW (1–2/8), SCT (3–4/8), BKN (5–7/8), OVC (8/8).
- Altura de bases en pies AGL y techo identificado para BKN/OVC/VV.
- Componentes de viento cruzado, de frente y de cola.
- Detección preliminar de grupos de nubosidad en METAR/TAF facilitados por el usuario.

**Limitaciones:** El parser es parcial y no debe describirse como decodificador completo. SKC, CLR, NSC y NCD no son equivalentes. El rumbo de pista debe verificarse en grados reales/magnéticos coherentes con el viento. Nunca usar sin confirmación con fuentes oficiales y documentación del vuelo.

**Estado:** Preparado en rama independiente. No conectado al chat existente ni desplegado. Siguiente paso: pruebas automatizadas, integrarlo en `robert-chat` y agregar proveedor autorizado de METAR/TAF con fecha de emisión y vigencia.
