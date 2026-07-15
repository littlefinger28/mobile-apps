import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  SafeAreaView,
  ScrollView,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Platform
} from "react-native";
import { StatusBar } from "expo-status-bar";
import AsyncStorage from "@react-native-async-storage/async-storage";

const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
];
const DIAS_SEMANA = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

const STORAGE_KEY_DIAS = "dias-estado";
const STORAGE_KEY_GASTOS = "gastos-lista";

function claveDia(anio, mes, dia) {
  return `${anio}-${String(mes + 1).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

function esLaborable(anio, mes, dia) {
  const d = new Date(anio, mes, dia).getDay();
  return d !== 0 && d !== 6;
}

function siguienteEstado(actual, laborable) {
  const ordenLaborable = ["verde", "naranja", "rojo"];
  const ordenFinde = ["neutro", "verde", "naranja", "rojo"];
  const orden = laborable ? ordenLaborable : ordenFinde;
  const idx = orden.indexOf(actual);
  return orden[(idx + 1) % orden.length];
}

const ESTADO_LABEL = {
  verde: "trabajé",
  naranja: "no trabajé",
  rojo: "médico",
  neutro: "sin estado"
};

const COLORES = {
  verde: { bg: "#3F6B4F", fg: "#F3F1E7", ring: "#2E4F3A" },
  naranja: { bg: "#C97A3D", fg: "#F3F1E7", ring: "#9C5A2A" },
  rojo: { bg: "#A83B32", fg: "#F3F1E7", ring: "#7C2A23" },
  neutro: { bg: "#F3F1E7", fg: "#3A362C", ring: "#DAD5C4" }
};

function hoyISO() {
  const h = new Date();
  return `${h.getFullYear()}-${String(h.getMonth() + 1).padStart(2, "0")}-${String(h.getDate()).padStart(2, "0")}`;
}

export default function App() {
  const [pestana, setPestana] = useState("calendario");

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="dark" />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <BarraSuperior pestana={pestana} setPestana={setPestana} />
        {pestana === "calendario" ? <PanelCalendario /> : <PanelGastos />}
      </ScrollView>
    </SafeAreaView>
  );
}

function BarraSuperior({ pestana, setPestana }) {
  return (
    <View style={styles.tabBar}>
      <TabBtn
        activo={pestana === "calendario"}
        onPress={() => setPestana("calendario")}
        texto="Calendario"
      />
      <TabBtn
        activo={pestana === "gastos"}
        onPress={() => setPestana("gastos")}
        texto="Gastos"
      />
    </View>
  );
}

function TabBtn({ activo, onPress, texto }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[styles.tabBtn, activo && styles.tabBtnActivo]}
    >
      <Text style={[styles.tabBtnTexto, activo && styles.tabBtnTextoActivo]}>
        {texto}
      </Text>
    </TouchableOpacity>
  );
}

/* ---------------- PANEL CALENDARIO ---------------- */

function PanelCalendario() {
  const hoy = new Date();
  const [anio, setAnio] = useState(hoy.getFullYear());
  const [mes, setMes] = useState(hoy.getMonth());
  const [estados, setEstados] = useState({});
  const [cargado, setCargado] = useState(false);
  const [vacaciones, setVacaciones] = useState(34);

  useEffect(() => {
    (async () => {
      try {
        const valor = await AsyncStorage.getItem(STORAGE_KEY_DIAS);
        if (valor) setEstados(JSON.parse(valor));
      } catch (e) {
        // sin datos todavía
      } finally {
        setCargado(true);
      }
    })();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const valor = await AsyncStorage.getItem(`vacaciones-${anio}`);
        setVacaciones(valor !== null ? Number(valor) : 34);
      } catch (e) {
        setVacaciones(34);
      }
    })();
  }, [anio]);

  const guardarEstados = useCallback(async (nuevo) => {
    try {
      await AsyncStorage.setItem(STORAGE_KEY_DIAS, JSON.stringify(nuevo));
    } catch (e) {
      console.error("Error al guardar:", e);
    }
  }, []);

  const cambiarVacaciones = async (texto) => {
    const numero = texto === "" ? 0 : Number(texto.replace(/[^0-9]/g, ""));
    setVacaciones(numero);
    try {
      await AsyncStorage.setItem(`vacaciones-${anio}`, String(numero));
    } catch (e) {
      console.error("Error al guardar vacaciones:", e);
    }
  };

  const alternarDia = (dia) => {
    const laborable = esLaborable(anio, mes, dia);
    const clave = claveDia(anio, mes, dia);
    const actual = estados[clave] || (laborable ? "verde" : "neutro");
    const siguiente = siguienteEstado(actual, laborable);
    const porDefecto = laborable ? "verde" : "neutro";

    const nuevo = { ...estados };
    if (siguiente === porDefecto) {
      delete nuevo[clave];
    } else {
      nuevo[clave] = siguiente;
    }
    setEstados(nuevo);
    guardarEstados(nuevo);
  };

  const rejilla = useMemo(() => {
    const primerDiaSemana = new Date(anio, mes, 1).getDay();
    const totalDias = new Date(anio, mes + 1, 0).getDate();
    const celdas = [];
    for (let i = 0; i < primerDiaSemana; i++) celdas.push(null);
    for (let d = 1; d <= totalDias; d++) celdas.push(d);
    return celdas;
  }, [anio, mes]);

  const cambiarMes = (delta) => {
    let nuevoMes = mes + delta;
    let nuevoAnio = anio;
    if (nuevoMes < 0) { nuevoMes = 11; nuevoAnio -= 1; }
    if (nuevoMes > 11) { nuevoMes = 0; nuevoAnio += 1; }
    setMes(nuevoMes);
    setAnio(nuevoAnio);
  };

  const conteos = useMemo(() => {
    const c = { verde: 0, naranja: 0, rojo: 0 };
    rejilla.forEach((dia) => {
      if (!dia) return;
      const laborable = esLaborable(anio, mes, dia);
      const clave = claveDia(anio, mes, dia);
      const estado = estados[clave] || (laborable ? "verde" : "neutro");
      if (c[estado] !== undefined) c[estado] += 1;
    });
    return c;
  }, [rejilla, estados, anio, mes]);

  const conteosAnio = useMemo(() => {
    const c = { naranja: 0, rojo: 0 };
    Object.entries(estados).forEach(([clave, estado]) => {
      if (clave.startsWith(`${anio}-`) && c[estado] !== undefined) {
        c[estado] += 1;
      }
    });
    return c;
  }, [estados, anio]);

  const excedentePorMes = useMemo(() => {
    const contarNaranjaMes = (m) => {
      let cuenta = 0;
      const totalDias = new Date(anio, m + 1, 0).getDate();
      for (let d = 1; d <= totalDias; d++) {
        if (estados[claveDia(anio, m, d)] === "naranja") cuenta += 1;
      }
      return cuenta;
    };

    let previo = 0;
    const resultado = [];
    for (let m = 0; m <= 11; m++) {
      const cuenta = contarNaranjaMes(m);
      const acumulado = previo + cuenta;
      let exceso = 0;
      if (acumulado > vacaciones) {
        exceso = previo >= vacaciones ? cuenta : acumulado - vacaciones;
      }
      resultado.push(exceso);
      previo = acumulado;
    }
    return resultado;
  }, [estados, anio, vacaciones]);

  const excedenteMes = excedentePorMes[mes];
  const mesesConExceso = excedentePorMes
    .map((exceso, m) => ({ mes: m, exceso }))
    .filter((item) => item.exceso > 0);

  return (
    <View>
      <View style={styles.navRow}>
        <TouchableOpacity onPress={() => cambiarMes(-1)} style={styles.navBtn}>
          <Text style={styles.navBtnTexto}>‹</Text>
        </TouchableOpacity>

        <Text style={styles.mesTitulo}>{MESES[mes]} {anio}</Text>

        <TouchableOpacity onPress={() => cambiarMes(1)} style={styles.navBtn}>
          <Text style={styles.navBtnTexto}>›</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.filaSemana}>
        {DIAS_SEMANA.map((d) => (
          <Text key={d} style={styles.diaSemanaTexto}>{d}</Text>
        ))}
      </View>

      <View style={styles.rejilla}>
        {rejilla.map((dia, i) => {
          if (!dia) return <View key={`vacio-${i}`} style={styles.celdaVacia} />;
          const laborable = esLaborable(anio, mes, dia);
          const clave = claveDia(anio, mes, dia);
          const estado = estados[clave] || (laborable ? "verde" : "neutro");
          const color = COLORES[estado];
          const esHoy = anio === hoy.getFullYear() && mes === hoy.getMonth() && dia === hoy.getDate();

          return (
            <TouchableOpacity
              key={clave}
              onPress={() => alternarDia(dia)}
              style={[
                styles.celdaDia,
                { backgroundColor: color.bg, borderColor: esHoy ? "#2B2820" : color.ring, borderWidth: esHoy ? 2 : 1 }
              ]}
            >
              <Text style={{ color: color.fg, fontWeight: esHoy ? "700" : "500", fontSize: 14 }}>
                {dia}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={styles.leyendaFila}>
        <Leyenda color={COLORES.verde.bg} texto={`Trabajé (${conteos.verde})`} />
        <Leyenda color={COLORES.naranja.bg} texto={`No trabajé (${conteos.naranja})`} />
        <Leyenda color={COLORES.rojo.bg} texto={`Médico (${conteos.rojo})`} />
      </View>

      <Text style={styles.textoAyuda}>Clica en el día para cambiar el estado.</Text>

      <View style={styles.filaResumen}>
        <ResumenAnual
          color={COLORES.naranja.bg}
          etiqueta="No trabajé este año"
          valor={conteosAnio.naranja}
          alerta={conteosAnio.naranja > vacaciones}
        />
        <ResumenAnual color={COLORES.rojo.bg} etiqueta="Médico este año" valor={conteosAnio.rojo} />
      </View>

      <View style={styles.cajaVacaciones}>
        <Text style={styles.cajaVacacionesTexto}>Vacaciones y festivos</Text>
        <TextInput
          value={String(vacaciones)}
          onChangeText={cambiarVacaciones}
          keyboardType="number-pad"
          style={styles.inputVacaciones}
        />
      </View>

      {excedenteMes > 0 && (
        <View style={styles.cajaExceso}>
          <Text style={styles.cajaExcesoTexto}>Días en exceso este mes</Text>
          <Text style={styles.cajaExcesoValor}>{excedenteMes}</Text>
        </View>
      )}

      {mesesConExceso.length > 0 && (
        <View style={styles.listaExceso}>
          <Text style={styles.listaExcesoTitulo}>Exceso por mes en {anio}</Text>
          {mesesConExceso.map((item, i) => (
            <View
              key={item.mes}
              style={[
                styles.listaExcesoFila,
                i < mesesConExceso.length - 1 && styles.listaExcesoFilaBorde
              ]}
            >
              <Text style={{
                color: item.mes === mes ? "#2B2820" : "#5C5745",
                fontWeight: item.mes === mes ? "700" : "400",
                fontSize: 13
              }}>
                {MESES[item.mes]}
              </Text>
              <Text style={{ fontWeight: "600", color: "#A83B32", fontSize: 13 }}>
                {item.exceso}
              </Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

function Leyenda({ color, texto }) {
  return (
    <View style={styles.leyendaItem}>
      <View style={[styles.leyendaPunto, { backgroundColor: color }]} />
      <Text style={styles.leyendaTexto}>{texto}</Text>
    </View>
  );
}

function ResumenAnual({ color, etiqueta, valor, alerta }) {
  return (
    <View style={styles.resumenCaja}>
      <View style={[styles.resumenPunto, { backgroundColor: color }]} />
      <View>
        <Text style={styles.resumenEtiqueta}>{etiqueta}</Text>
        <Text style={[styles.resumenValor, alerta && { color: "#A83B32" }]}>{valor}</Text>
      </View>
    </View>
  );
}

/* ---------------- PANEL GASTOS ---------------- */

const CUENTA = "Blue Dot";
const TIPOS = [
  { valor: "debe", etiqueta: "Debe" },
  { valor: "pago", etiqueta: "Pagó" }
];

function PanelGastos() {
  const [entradas, setEntradas] = useState([]);
  const [tipo, setTipo] = useState("debe");
  const [valor, setValor] = useState("");
  const [dia, setDia] = useState(hoyISO());
  const [nota, setNota] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const guardado = await AsyncStorage.getItem(STORAGE_KEY_GASTOS);
        if (guardado) setEntradas(JSON.parse(guardado));
      } catch (e) {
        // sin datos todavía
      }
    })();
  }, []);

  const guardar = useCallback(async (nuevaLista) => {
    try {
      await AsyncStorage.setItem(STORAGE_KEY_GASTOS, JSON.stringify(nuevaLista));
    } catch (e) {
      console.error("Error al guardar:", e);
    }
  }, []);

  const agregarEntrada = () => {
    const numero = parseFloat(valor);
    if (!dia || isNaN(numero)) return;
    const nueva = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      cuenta: CUENTA,
      tipo,
      valor: numero,
      dia,
      nota: nota.trim()
    };
    const lista = [nueva, ...entradas].sort((a, b) => (a.dia < b.dia ? 1 : -1));
    setEntradas(lista);
    guardar(lista);
    setValor("");
    setNota("");
  };

  const eliminarEntrada = (id) => {
    const lista = entradas.filter((e) => e.id !== id);
    setEntradas(lista);
    guardar(lista);
  };

  const totalDebido = useMemo(() => {
    let debe = 0;
    let pago = 0;
    entradas.forEach((e) => {
      if (e.tipo === "debe") debe += e.valor;
      else pago += e.valor;
    });
    return debe - pago;
  }, [entradas]);

  const formatoMoneda = (v) => {
    const redondeado = Math.round(Math.abs(v));
    return `$ ${redondeado.toLocaleString("es-CO")}`;
  };

  const colorTotal = totalDebido > 0 ? "#A83B32" : totalDebido < 0 ? "#3F6B4F" : "#5C5745";
  const textoTotal = totalDebido > 0
    ? `Me debe ${formatoMoneda(totalDebido)}`
    : totalDebido < 0
      ? formatoMoneda(totalDebido)
      : "Todo saldado";

  return (
    <View>
      <Text style={styles.tituloGastos}>Gastos y pagos</Text>

      <View style={styles.formCaja}>
        <View style={styles.formFila}>
          <Campo etiqueta="Persona">
            <View style={[styles.input, styles.inputBloqueado]}>
              <Text style={{ color: "#5C5745" }}>{CUENTA}</Text>
            </View>
          </Campo>
          <Campo etiqueta="Pagó / Debe">
            <View style={styles.toggleFila}>
              {TIPOS.map((t) => (
                <TouchableOpacity
                  key={t.valor}
                  onPress={() => setTipo(t.valor)}
                  style={[styles.toggleBtn, tipo === t.valor && styles.toggleBtnActivo]}
                >
                  <Text style={[styles.toggleTexto, tipo === t.valor && styles.toggleTextoActivo]}>
                    {t.etiqueta}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </Campo>
        </View>

        <View style={styles.formFila}>
          <Campo etiqueta="Valor (COP)">
            <TextInput
              value={valor}
              onChangeText={setValor}
              placeholder="0"
              keyboardType="numeric"
              style={styles.input}
            />
          </Campo>
          <Campo etiqueta="Fecha (AAAA-MM-DD)">
            <TextInput
              value={dia}
              onChangeText={setDia}
              placeholder="2026-07-15"
              style={styles.input}
            />
          </Campo>
        </View>

        <Campo etiqueta="Nota (opcional)">
          <TextInput
            value={nota}
            onChangeText={setNota}
            placeholder="p. ej. supermercado"
            style={styles.input}
          />
        </Campo>

        <TouchableOpacity onPress={agregarEntrada} style={styles.botonAgregar}>
          <Text style={styles.botonAgregarTexto}>+ Añadir entrada</Text>
        </TouchableOpacity>
      </View>

      <View style={[styles.totalCaja, { borderColor: colorTotal }]}>
        <Text style={styles.totalEtiqueta}>Total</Text>
        <Text style={[styles.totalValor, { color: colorTotal }]}>{textoTotal}</Text>
      </View>

      <View style={styles.listaGastos}>
        {entradas.length === 0 ? (
          <Text style={styles.listaVacia}>Todavía no hay entradas. Añade la primera arriba.</Text>
        ) : (
          entradas.map((e, i) => (
            <View
              key={e.id}
              style={[
                styles.filaGasto,
                i < entradas.length - 1 && styles.filaGastoBorde
              ]}
            >
              <View style={styles.filaGastoTop}>
                <View style={styles.filaGastoIzq}>
                  <View style={[
                    styles.badge,
                    { backgroundColor: e.tipo === "debe" ? "#A83B32" : "#3F6B4F" }
                  ]}>
                    <Text style={styles.badgeTexto}>{e.tipo === "debe" ? "DEBE" : "PAGÓ"}</Text>
                  </View>
                  <Text style={styles.filaGastoFecha}>{e.dia}</Text>
                </View>
                <View style={styles.filaGastoDer}>
                  <Text style={styles.filaGastoValor}>{formatoMoneda(e.valor)}</Text>
                  <TouchableOpacity onPress={() => eliminarEntrada(e.id)} style={styles.botonEliminar}>
                    <Text style={{ color: "#B33F3F", fontSize: 16 }}>×</Text>
                  </TouchableOpacity>
                </View>
              </View>
              {!!e.nota && <Text style={styles.filaGastoNota} numberOfLines={2}>{e.nota}</Text>}
            </View>
          ))
        )}
      </View>
    </View>
  );
}

function Campo({ etiqueta, children }) {
  return (
    <View style={styles.campo}>
      <Text style={styles.campoEtiqueta}>{etiqueta}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#EDE9DC" },
  scrollContent: { padding: 16, paddingTop: 56, paddingBottom: 40 },

  tabBar: {
    flexDirection: "row",
    gap: 6,
    backgroundColor: "#F7F4EA",
    borderWidth: 1,
    borderColor: "#DAD5C4",
    borderRadius: 10,
    padding: 4,
    marginBottom: 18
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 7,
    alignItems: "center",
    justifyContent: "center"
  },
  tabBtnActivo: { backgroundColor: "#2B2820" },
  tabBtnTexto: { color: "#5C5745", fontWeight: "600", fontSize: 13 },
  tabBtnTextoActivo: { color: "#F3F1E7" },

  navRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16
  },
  navBtn: {
    width: 34,
    height: 34,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#DAD5C4",
    backgroundColor: "#F7F4EA",
    alignItems: "center",
    justifyContent: "center"
  },
  navBtnTexto: { fontSize: 18, color: "#2B2820" },
  mesTitulo: { fontSize: 16, fontWeight: "700", color: "#2B2820" },

  filaSemana: { flexDirection: "row", marginBottom: 6 },
  diaSemanaTexto: {
    flex: 1,
    textAlign: "center",
    fontSize: 11,
    color: "#9B9581",
    fontWeight: "600"
  },

  rejilla: {
    flexDirection: "row",
    flexWrap: "wrap",
    backgroundColor: "#F7F4EA",
    borderWidth: 1,
    borderColor: "#DAD5C4",
    borderRadius: 10,
    padding: 6
  },
  celdaVacia: { width: `${100 / 7}%`, aspectRatio: 1 },
  celdaDia: {
    width: `${100 / 7}%`,
    aspectRatio: 1,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    marginVertical: 3
  },

  leyendaFila: { flexDirection: "row", flexWrap: "wrap", gap: 14, marginTop: 18 },
  leyendaItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  leyendaPunto: { width: 11, height: 11, borderRadius: 3 },
  leyendaTexto: { fontSize: 12, color: "#5C5745" },

  textoAyuda: { fontSize: 12.5, color: "#9B9581", marginTop: 18 },

  filaResumen: { flexDirection: "row", gap: 10, marginTop: 16 },
  resumenCaja: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#F7F4EA",
    borderWidth: 1,
    borderColor: "#DAD5C4",
    borderRadius: 10,
    padding: 10
  },
  resumenPunto: { width: 10, height: 10, borderRadius: 3 },
  resumenEtiqueta: { fontSize: 10.5, color: "#9B9581" },
  resumenValor: { fontSize: 18, fontWeight: "700", color: "#2B2820" },

  cajaVacaciones: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 12,
    padding: 12,
    backgroundColor: "#F7F4EA",
    borderWidth: 1,
    borderColor: "#DAD5C4",
    borderRadius: 10
  },
  cajaVacacionesTexto: { fontSize: 13, color: "#5C5745" },
  inputVacaciones: {
    width: 64,
    textAlign: "center",
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: "#DAD5C4",
    borderRadius: 7,
    backgroundColor: "#FFFFFF",
    fontSize: 13
  },

  cajaExceso: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 8,
    padding: 12,
    backgroundColor: "#FBEDEB",
    borderWidth: 1,
    borderColor: "#E3B8B2",
    borderRadius: 10
  },
  cajaExcesoTexto: { fontSize: 12.5, color: "#8A2F27" },
  cajaExcesoValor: { fontSize: 18, fontWeight: "700", color: "#A83B32" },

  listaExceso: {
    marginTop: 12,
    backgroundColor: "#F7F4EA",
    borderWidth: 1,
    borderColor: "#DAD5C4",
    borderRadius: 10,
    overflow: "hidden"
  },
  listaExcesoTitulo: {
    padding: 12,
    fontSize: 11,
    letterSpacing: 0.5,
    textTransform: "uppercase",
    color: "#9B9581",
    borderBottomWidth: 1,
    borderBottomColor: "#DAD5C4"
  },
  listaExcesoFila: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  listaExcesoFilaBorde: { borderBottomWidth: 1, borderBottomColor: "#ECE7D8" },

  tituloGastos: { fontSize: 26, fontWeight: "700", color: "#2B2820", marginBottom: 16 },

  formCaja: {
    backgroundColor: "#F7F4EA",
    borderWidth: 1,
    borderColor: "#DAD5C4",
    borderRadius: 10,
    padding: 14,
    marginBottom: 18
  },
  formFila: { flexDirection: "row", gap: 10 },
  campo: { flex: 1, marginBottom: 10 },
  campoEtiqueta: { fontSize: 11, color: "#9B9581", marginBottom: 4 },
  input: {
    borderWidth: 1,
    borderColor: "#DAD5C4",
    borderRadius: 7,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 10,
    paddingVertical: Platform.OS === "ios" ? 9 : 6,
    fontSize: 13,
    color: "#2B2820"
  },
  inputBloqueado: {
    justifyContent: "center",
    backgroundColor: "#EDE9DC"
  },

  toggleFila: { flexDirection: "row", gap: 6 },
  toggleBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: "#DAD5C4",
    backgroundColor: "#FFFFFF",
    alignItems: "center"
  },
  toggleBtnActivo: { backgroundColor: "#2B2820", borderColor: "#2B2820" },
  toggleTexto: { fontSize: 12.5, color: "#5C5745", fontWeight: "600" },
  toggleTextoActivo: { color: "#F3F1E7" },

  botonAgregar: {
    backgroundColor: "#2B2820",
    borderRadius: 8,
    paddingVertical: 11,
    alignItems: "center",
    marginTop: 2
  },
  botonAgregarTexto: { color: "#F3F1E7", fontWeight: "700", fontSize: 13 },

  totalCaja: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#F7F4EA",
    borderWidth: 1,
    borderRadius: 10,
    padding: 14,
    marginBottom: 18
  },
  totalEtiqueta: { fontSize: 12.5, color: "#5C5745" },
  totalValor: { fontSize: 18, fontWeight: "700" },

  listaGastos: {
    backgroundColor: "#F7F4EA",
    borderWidth: 1,
    borderColor: "#DAD5C4",
    borderRadius: 10,
    overflow: "hidden"
  },
  listaVacia: { padding: 22, textAlign: "center", fontSize: 12.5, color: "#9B9581" },

  filaGasto: { padding: 10 },
  filaGastoBorde: { borderBottomWidth: 1, borderBottomColor: "#ECE7D8" },
  filaGastoTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  filaGastoIzq: { flexDirection: "row", alignItems: "center", gap: 6 },
  filaGastoDer: { flexDirection: "row", alignItems: "center", gap: 8 },
  badge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 20 },
  badgeTexto: { fontSize: 10, fontWeight: "700", color: "#F3F1E7" },
  filaGastoFecha: { fontSize: 11.5, color: "#9B9581" },
  filaGastoValor: { fontSize: 13.5, fontWeight: "700", color: "#2B2820" },
  botonEliminar: { padding: 4 },
  filaGastoNota: { fontSize: 11.5, color: "#5C5745", marginTop: 4, lineHeight: 16 }
});
