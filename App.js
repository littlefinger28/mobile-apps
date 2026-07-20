import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  SafeAreaView,
  ScrollView,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Alert,
  Modal,
  Image,
  Button,
  PanResponder
} from "react-native";
import { StatusBar } from "expo-status-bar";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system/legacy";

const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
];
const DIAS_SEMANA = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

const unlockKey = "8998";

function claveDia(anio, mes, dia) {
  return `${anio}-${String(mes + 1).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

function esLaborable(anio, mes, dia) {
  const d = new Date(anio, mes, dia).getDay();
  return d !== 0 && d !== 6;
}

// ---------------- ALMACENAMIENTO LOCAL (AsyncStorage + sistema de archivos) ----------------
// Todos los datos se guardan únicamente en este dispositivo. No hay conexión a internet
// ni sincronización entre dispositivos.

const KEY_SUELDO = "@sueldo_base";
const KEY_DIAS_ESTADO = "@dias_estado";
const KEY_DIAS_FOTOS = "@dias_fotos";
const KEY_VACACIONES = "@vacaciones";
const KEY_GASTOS = "@gastos";

async function leerJSON(clave, valorDefecto) {
  try {
    const bruto = await AsyncStorage.getItem(clave);
    return bruto !== null ? JSON.parse(bruto) : valorDefecto;
  } catch (e) {
    console.error(`Error al leer ${clave}:`, e);
    return valorDefecto;
  }
}

async function guardarJSON(clave, valor) {
  try {
    await AsyncStorage.setItem(clave, JSON.stringify(valor));
  } catch (e) {
    console.error(`Error al guardar ${clave}:`, e);
  }
}

// Carpeta permanente dentro del propio dispositivo donde se guardan las fotos.
const CARPETA_FOTOS = FileSystem.documentDirectory + "fotos/";

async function garantizarCarpetaFotos() {
  const info = await FileSystem.getInfoAsync(CARPETA_FOTOS);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(CARPETA_FOTOS, { intermediates: true });
  }
}

// Copia la foto elegida (cámara o galería) a la carpeta de la app y devuelve
// la ruta local (file://...) que queda guardada para siempre en el teléfono.
async function guardarFotoLocal(uriOriginal) {
  try {
    await garantizarCarpetaFotos();
    const nombre = `foto-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.jpg`;
    const destino = CARPETA_FOTOS + nombre;
    await FileSystem.copyAsync({ from: uriOriginal, to: destino });
    return destino;
  } catch (e) {
    console.error("Error al guardar la foto localmente:", e);
    return uriOriginal;
  }
}

// Intenta borrar el archivo físico de una foto (si falla, no pasa nada grave).
async function borrarFotoLocal(uri) {
  try {
    if (uri && uri.startsWith(FileSystem.documentDirectory)) {
      await FileSystem.deleteAsync(uri, { idempotent: true });
    }
  } catch (e) {
    console.error("Error al borrar el archivo de la foto:", e);
  }
}

const SUELDO_BASE = 189928;

function diasUtilesDelMes(anio, mes) {
  const totalDias = new Date(anio, mes + 1, 0).getDate();
  let cuenta = 0;
  for (let d = 1; d <= totalDias; d++) {
    if (esLaborable(anio, mes, d)) cuenta += 1;
  }
  return cuenta;
}

function ultimoDiaISO(anio, mes) {
  const totalDias = new Date(anio, mes + 1, 0).getDate();
  return claveDia(anio, mes, totalDias);
}

// Si el mes elegido todavía no ha ocurrido este año (es posterior al mes actual),
// se refiere al mismo mes del año anterior.
function anioParaMesElegido(mesElegido) {
  const hoy = new Date();
  const mesActual = hoy.getMonth();
  const anioActual = hoy.getFullYear();
  return mesElegido > mesActual ? anioActual - 1 : anioActual;
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

// CORREÇÃO 1: Adicionado 'setIsLocked' como dependência no array do useEffect
function UnlockApp({ isLocked, setIsLocked }) { 
  const [modalVisivel, setModalVisivel] = useState(false);
  const [senhaDigitada, setSenhaDigitada] = useState("");

  useEffect(() => {
    const setLockedStates = async () => {
      try {
        const saved = await AsyncStorage.getItem('@app_bloqueado');
        if (saved !== null) {
          setIsLocked(JSON.parse(saved));
        }
      } catch (e) {
        console.log("Erro ao carregar estado", e);
      }
    };
    
    setLockedStates();
  }, [setIsLocked]);

  const saveLockedState = async (newState) => {
    try {
      await AsyncStorage.setItem('@app_bloqueado', JSON.stringify(newState));
      setIsLocked(newState);
    } catch (e) {
      console.log("Erro ao salvar estado", e);
    }
  };

  const manageUnlock = () => {
    if (!isLocked) {
      saveLockedState(true);
      Alert.alert("Bloqueado", "O aplicativo foi bloqueado novamente.");
    } else {
      setSenhaDigitada("");
      setModalVisivel(true);
    }
  };

  const verificarSenha = () => {
    if (String(senhaDigitada) === String(unlockKey)) {
      saveLockedState(false);
      setModalVisivel(false);
    } else {
      Alert.alert("Erro", "Contraseña incorrecta!");
    }
  };

  return (
    <View style={styles.containerLock}>
      <TouchableOpacity
        style={[
          styles.botaoLockCustom,
          { backgroundColor: isLocked ? "#888888" : "#4CAF50" }
        ]}
        onPress={manageUnlock}
      >
        <Text style={[styles.botaoLockTextoCustom, { fontSize: 20 }]}>
          {isLocked ? "🔒" : "🔓"}
        </Text>
      </TouchableOpacity>

      <Modal
        visible={modalVisivel}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setModalVisivel(false)}
      >
        <View style={styles.modalLockFundo}>
          <View style={styles.modalLockCaja}>
            <Text style={styles.modalLockTitulo}>Digite la contraseña</Text>
            
            <TextInput
              style={styles.modalLockInput}
              placeholder="Contraseña"
              secureTextEntry={true}
              keyboardType="numeric"
              value={senhaDigitada}
              onChangeText={(texto) => setSenhaDigitada(texto)}
            />

            <View style={styles.modalLockBotoes}>
              <TouchableOpacity 
                style={[styles.modalLockBtn, { backgroundColor: '#DAD5C4' }]} 
                onPress={() => setModalVisivel(false)}
              >
                <Text style={{ color: '#2B2820', fontWeight: '600' }}>Cancelar</Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={[styles.modalLockBtn, { backgroundColor: '#2B2820' }]} 
                onPress={verificarSenha}
              >
                <Text style={{ color: '#F3F1E7', fontWeight: '600' }}>OK</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
} 

export default function App() {
  const [pestana, setPestana] = useState("calendario");
  const [isLocked, setIsLocked] = useState(true);
  const [sueldoBase, setSueldoBase] = useState(SUELDO_BASE);

  useEffect(() => {
    let activo = true;
    (async () => {
      const valor = await leerJSON(KEY_SUELDO, SUELDO_BASE);
      if (activo) setSueldoBase(valor);
    })();
    return () => {
      activo = false;
    };
  }, []);

  const cambiarSueldoBase = async (nuevoValor) => {
    setSueldoBase(nuevoValor);
    await guardarJSON(KEY_SUELDO, nuevoValor);
  };

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="dark" />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <UnlockApp isLocked={isLocked} setIsLocked={setIsLocked} />
        
        <BarraSuperior pestana={pestana} setPestana={setPestana} />
        
        {pestana === "calendario" ? (
          <PanelCalendario isLocked={isLocked} sueldoBase={sueldoBase} onCambiarSueldoBase={cambiarSueldoBase} />
        ) : (
          <PanelGastos isLocked={isLocked} sueldoBase={sueldoBase} />
        )}
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

function PanelCalendario({ isLocked, sueldoBase, onCambiarSueldoBase }) {
  const hoy = new Date();
  const [anio, setAnio] = useState(hoy.getFullYear());
  const [mes, setMes] = useState(hoy.getMonth());
  const [estados, setEstados] = useState({});
  const [cargado, setCargado] = useState(false);
  const [vacaciones, setVacaciones] = useState(34);

  const [clavesConFoto, setClavesConFoto] = useState({});
  const [modalFotosVisible, setModalFotosVisible] = useState(false);
  const [diaFotosClave, setDiaFotosClave] = useState(null);
  const [fotosDelDia, setFotosDelDia] = useState([]);
  const [cargandoFotos, setCargandoFotos] = useState(false);
  const [subiendoFoto, setSubiendoFoto] = useState(false);
  const [fotoAmpliada, setFotoAmpliada] = useState(null);

  useEffect(() => {
    let activo = true;
    (async () => {
      const data = await leerJSON(KEY_DIAS_FOTOS, []);
      if (activo) {
        const mapa = {};
        data.forEach((fila) => { mapa[fila.clave] = (mapa[fila.clave] || 0) + 1; });
        setClavesConFoto(mapa);
      }
    })();
    return () => {
      activo = false;
    };
  }, []);

  const abrirFotosDia = async (clave) => {
    setDiaFotosClave(clave);
    setModalFotosVisible(true);
    setCargandoFotos(true);
    try {
      const todas = await leerJSON(KEY_DIAS_FOTOS, []);
      const delDia = todas
        .filter((f) => f.clave === clave)
        .sort((a, b) => (b.creado_en || 0) - (a.creado_en || 0));
      setFotosDelDia(delDia);
    } catch (e) {
      console.error("Error al cargar fotos del día:", e);
      setFotosDelDia([]);
    } finally {
      setCargandoFotos(false);
    }
  };

  const agregarFotoADia = async (origen) => {
    if (!diaFotosClave) return;
    const permiso =
      origen === "camara"
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permiso.granted) {
      Alert.alert(
        "Permiso necesario",
        origen === "camara"
          ? "Necesitas dar permiso para usar la cámara."
          : "Necesitas dar permiso para acceder a tus fotos."
      );
      return;
    }
    const resultado =
      origen === "camara"
        ? await ImagePicker.launchCameraAsync({ quality: 0.6 })
        : await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            quality: 0.6
          });
    if (resultado.canceled || !resultado.assets || !resultado.assets[0]) return;

    setSubiendoFoto(true);
    try {
      const rutaLocal = await guardarFotoLocal(resultado.assets[0].uri);
      const nuevaFila = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        clave: diaFotosClave,
        foto: rutaLocal,
        creado_en: Date.now()
      };
      setFotosDelDia((prev) => [nuevaFila, ...prev]);
      setClavesConFoto((prev) => ({ ...prev, [diaFotosClave]: (prev[diaFotosClave] || 0) + 1 }));
      const todas = await leerJSON(KEY_DIAS_FOTOS, []);
      await guardarJSON(KEY_DIAS_FOTOS, [nuevaFila, ...todas]);
    } catch (e) {
      console.error("Error al añadir foto:", e);
      Alert.alert("Error", "No se pudo añadir la foto.");
    } finally {
      setSubiendoFoto(false);
    }
  };

  const elegirOrigenFoto = () => {
    Alert.alert("Añadir foto", "¿De dónde quieres la imagen?", [
      { text: "Cancelar", style: "cancel" },
      { text: "Cámara", onPress: () => agregarFotoADia("camara") },
      { text: "Galería", onPress: () => agregarFotoADia("galeria") }
    ]);
  };

  const eliminarFoto = (fila) => {
    Alert.alert("Eliminar foto", "¿Seguro que quieres eliminar esta foto?", [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Eliminar",
        style: "destructive",
        onPress: async () => {
          setFotosDelDia((prev) => prev.filter((f) => f.id !== fila.id));
          setClavesConFoto((prev) => {
            const copia = { ...prev };
            const restante = (copia[fila.clave] || 1) - 1;
            if (restante <= 0) delete copia[fila.clave];
            else copia[fila.clave] = restante;
            return copia;
          });
          try {
            await borrarFotoLocal(fila.foto);
            const todas = await leerJSON(KEY_DIAS_FOTOS, []);
            await guardarJSON(KEY_DIAS_FOTOS, todas.filter((f) => f.id !== fila.id));
          } catch (e) {
            console.error("Error al eliminar foto:", e);
          }
        }
      }
    ]);
  };

  useEffect(() => {
    let activo = true;
    (async () => {
      const mapa = await leerJSON(KEY_DIAS_ESTADO, {});
      if (activo) setEstados(mapa);
      if (activo) setCargado(true);
    })();
    return () => {
      activo = false;
    };
  }, []);

  useEffect(() => {
    let activo = true;
    (async () => {
      const mapa = await leerJSON(KEY_VACACIONES, {});
      if (activo) setVacaciones(typeof mapa[anio] === "number" ? mapa[anio] : 34);
    })();
    return () => { activo = false; };
  }, [anio]);

  const cambiarVacaciones = async (texto) => {
    const numero = texto === "" ? 0 : Number(texto.replace(/[^0-9]/g, ""));
    setVacaciones(numero);
    try {
      const mapa = await leerJSON(KEY_VACACIONES, {});
      mapa[anio] = numero;
      await guardarJSON(KEY_VACACIONES, mapa);
    } catch (e) {
      console.error("Error al guardar vacaciones:", e);
    }
  };

  const cambiarSueldo = (texto) => {
    if (isLocked) return;
    const numero = texto === "" ? 0 : Number(texto.replace(/[^0-9]/g, ""));
    onCambiarSueldoBase(numero);
  };

  const alternarDia = async (dia) => {
    if (isLocked) {
      return;
    }
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

    try {
      await guardarJSON(KEY_DIAS_ESTADO, nuevo);
    } catch (e) {
      console.error("Error al guardar:", e);
    }
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

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (evt, gestureState) => {
        return Math.abs(gestureState.dx) > 20 && Math.abs(gestureState.dx) > Math.abs(gestureState.dy) * 2;
      },
      onPanResponderRelease: (evt, gestureState) => {
        if (gestureState.dx <= -50) {
          cambiarMes(1);
        } else if (gestureState.dx >= 50) {
          cambiarMes(-1);
        }
      }
    })
  ).current;

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
    <View {...panResponder.panHandlers}>
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
              onLongPress={() => abrirFotosDia(clave)}
              delayLongPress={350}
              style={[
                styles.celdaDia,
                { backgroundColor: color.bg, borderColor: esHoy ? "#2B2820" : color.ring, borderWidth: esHoy ? 2 : 1 }
              ]}
            >
              <Text style={{ color: color.fg, fontWeight: esHoy ? "700" : "500", fontSize: 14 }}>
                {dia}
              </Text>
              {!!clavesConFoto[clave] && <Text style={styles.indicadorFoto}>📷</Text>}
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={styles.leyendaFila}>
        <Leyenda color={COLORES.verde.bg} texto={`Trabajé (${conteos.verde})`} />
        <Leyenda color={COLORES.naranja.bg} texto={`No trabajé (${conteos.naranja})`} />
        <Leyenda color={COLORES.rojo.bg} texto={`Médico (${conteos.rojo})`} />
      </View>

      <Text style={styles.textoAyuda}>Clica en el día para cambiar el estado. Mantén pulsado para ver/añadir fotos.</Text>

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

      <View style={styles.cajaVacaciones}>
        <Text style={styles.cajaVacacionesTexto}>Sueldo mensual</Text>
        <TextInput
          value={String(sueldoBase)}
          onChangeText={cambiarSueldo}
          keyboardType="number-pad"
          editable={!isLocked}
          style={[styles.inputVacaciones, isLocked && styles.inputBloqueado]}
        />
      </View>
      {isLocked && <Text style={styles.textoAyuda}>🔒 Desbloquea la app para editar el sueldo.</Text>}

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

      <Modal
        visible={modalFotosVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setModalFotosVisible(false)}
      >
        <TouchableOpacity
          style={styles.modalLockFundo}
          activeOpacity={1}
          onPress={() => setModalFotosVisible(false)}
        >
          <TouchableOpacity activeOpacity={1} style={styles.cajaModalFotos} onPress={() => {}}>
            <View style={styles.cabeceraModalFotos}>
              <Text style={styles.modalLockTitulo}>{diaFotosClave}</Text>
              <TouchableOpacity onPress={() => setModalFotosVisible(false)} style={styles.botonXFotos}>
                <Text style={styles.botonXFotosTexto}>✕</Text>
              </TouchableOpacity>
            </View>

            {!isLocked && (
              <TouchableOpacity
                onPress={elegirOrigenFoto}
                style={[styles.botonAgregar, subiendoFoto && { opacity: 0.6 }]}
                disabled={subiendoFoto}
              >
                <Text style={styles.botonAgregarTexto}>
                  {subiendoFoto ? "Subiendo..." : "📷 Añadir foto"}
                </Text>
              </TouchableOpacity>
            )}

            {cargandoFotos ? (
              <Text style={styles.textoAyuda}>Cargando fotos...</Text>
            ) : fotosDelDia.length === 0 ? (
              <Text style={styles.textoAyuda}>Todavía no hay fotos para este día.</Text>
            ) : (
              <ScrollView style={styles.scrollFotos}>
                <View style={styles.grillaFotos}>
                  {fotosDelDia.map((f) => (
                    <View key={f.id} style={styles.miniFotoWrap}>
                      <TouchableOpacity onPress={() => setFotoAmpliada(f.foto)}>
                        <Image source={{ uri: f.foto }} style={styles.miniFoto} />
                      </TouchableOpacity>
                      {!isLocked && (
                        <TouchableOpacity
                          onPress={() => eliminarFoto(f)}
                          style={styles.botonXMiniFoto}
                        >
                          <Text style={styles.botonXMiniFotoTexto}>✕</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  ))}
                </View>
              </ScrollView>
            )}

            <TouchableOpacity
              onPress={() => setModalFotosVisible(false)}
              style={[styles.modalLockBtn, { backgroundColor: "#DAD5C4", marginTop: 14 }]}
            >
              <Text style={{ color: "#2B2820", fontWeight: "600" }}>Cerrar</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      <Modal
        visible={!!fotoAmpliada}
        transparent
        animationType="fade"
        onRequestClose={() => setFotoAmpliada(null)}
      >
        <TouchableOpacity
          style={styles.modalFondo}
          activeOpacity={1}
          onPress={() => setFotoAmpliada(null)}
        >
          {!!fotoAmpliada && (
            <Image source={{ uri: fotoAmpliada }} style={styles.modalImagen} resizeMode="contain" />
          )}
          <TouchableOpacity onPress={() => setFotoAmpliada(null)} style={styles.modalCerrarBtn}>
            <Text style={styles.modalCerrarTexto}>Cerrar</Text>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
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

function PanelGastos({ isLocked, sueldoBase }) {
  const [entradas, setEntradas] = useState([]);
  const [tipo, setTipo] = useState("debe");
  const [valor, setValor] = useState("");
  const [dia, setDia] = useState(hoyISO());
  const [nota, setNota] = useState("");
  const [imagen, setImagen] = useState(null);
  const [mostrarArchivados, setMostrarArchivados] = useState(false);
  const [imagenVisible, setImagenVisible] = useState(null);

  const [tipoRapido, setTipoRapido] = useState("sueldo");
  const [mesRapido, setMesRapido] = useState(new Date().getMonth());
  const [calculandoRapido, setCalculandoRapido] = useState(false);

  const cargarEntradas = useCallback(async () => {
    try {
      const data = await leerJSON(KEY_GASTOS, []);
      setEntradas([...data].sort((a, b) => (a.dia < b.dia ? 1 : -1)));
    } catch (e) {
      console.error("Error al cargar gastos:", e);
    }
  }, []);

  useEffect(() => {
    cargarEntradas();
  }, [cargarEntradas]);

  // Copia la foto a la carpeta de la app para que quede guardada en este dispositivo.
  const guardarCopiaPermanente = async (uriOriginal) => {
    return guardarFotoLocal(uriOriginal);
  };

  const elegirDeGaleria = async () => {
    const permiso = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permiso.granted) {
      Alert.alert("Permiso necesario", "Necesitas dar permiso para acceder a tus fotos.");
      return;
    }
    const resultado = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.6
    });
    if (!resultado.canceled && resultado.assets && resultado.assets[0]) {
      const rutaFinal = await guardarCopiaPermanente(resultado.assets[0].uri);
      setImagen(rutaFinal);
    }
  };

  const tomarFoto = async () => {
    const permiso = await ImagePicker.requestCameraPermissionsAsync();
    if (!permiso.granted) {
      Alert.alert("Permiso necesario", "Necesitas dar permiso para usar la cámara.");
      return;
    }
    const resultado = await ImagePicker.launchCameraAsync({ quality: 0.6 });
    if (!resultado.canceled && resultado.assets && resultado.assets[0]) {
      const rutaFinal = await guardarCopiaPermanente(resultado.assets[0].uri);
      setImagen(rutaFinal);
    }
  };

  const elegirImagen = () => {
    Alert.alert("Añadir foto", "¿De dónde quieres la imagen?", [
      { text: "Cancelar", style: "cancel" },
      { text: "Cámara", onPress: tomarFoto },
      { text: "Galería", onPress: elegirDeGaleria }
    ]);
  };

  const agregarEntrada = async () => {
    const numero = parseFloat(valor);
    if (!dia || isNaN(numero)) return;
    const nueva = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      cuenta: CUENTA,
      tipo,
      valor: numero,
      dia,
      nota: nota.trim(),
      imagen: imagen || null,
      archivado: false
    };
    setEntradas((prev) => [nueva, ...prev].sort((a, b) => (a.dia < b.dia ? 1 : -1)));
    setValor("");
    setNota("");
    setImagen(null);
    try {
      const actuales = await leerJSON(KEY_GASTOS, []);
      await guardarJSON(KEY_GASTOS, [nueva, ...actuales]);
    } catch (e) {
      console.error("Error al guardar:", e);
    }
  };

  const agregarEntradaConDatos = async (valorNumero, diaISO, notaTexto) => {
    const nueva = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      cuenta: CUENTA,
      tipo: "debe",
      valor: valorNumero,
      dia: diaISO,
      nota: notaTexto,
      imagen: null,
      archivado: false
    };
    setEntradas((prev) => [nueva, ...prev].sort((a, b) => (a.dia < b.dia ? 1 : -1)));
    try {
      const actuales = await leerJSON(KEY_GASTOS, []);
      await guardarJSON(KEY_GASTOS, [nueva, ...actuales]);
    } catch (e) {
      console.error("Error al guardar entrada rápida:", e);
    }
  };

  const calcularYAgregarSueldo = async (mes) => {
    setCalculandoRapido(true);
    try {
      const anio = anioParaMesElegido(mes);
      const prefijo = `${anio}-${String(mes + 1).padStart(2, "0")}-`;
      const estadosGuardados = await leerJSON(KEY_DIAS_ESTADO, {});

      let naranjaCount = 0;
      Object.entries(estadosGuardados).forEach(([clave, estado]) => {
        if (!clave.startsWith(prefijo)) return;
        const dia = parseInt(clave.split("-")[2], 10);
        if (estado === "naranja" && esLaborable(anio, mes, dia)) {
          naranjaCount += 1;
        }
      });

      const totalUtiles = diasUtilesDelMes(anio, mes);
      const diasTrabajados = Math.max(totalUtiles - naranjaCount, 0);
      const valorNumero = Math.round((sueldoBase * diasTrabajados) / totalUtiles);
      const diaISO = ultimoDiaISO(anio, mes);
      const notaTexto = `Sueldo de ${MESES[mes].toLowerCase()}, trabajé ${diasTrabajados} días`;

      await agregarEntradaConDatos(valorNumero, diaISO, notaTexto);
    } catch (e) {
      console.error("Error al calcular sueldo:", e);
      Alert.alert("Error", "No se pudo calcular el sueldo de ese mes.");
    } finally {
      setCalculandoRapido(false);
    }
  };

  const calcularYAgregarVacaciones = async (mes) => {
    setCalculandoRapido(true);
    try {
      const anio = anioParaMesElegido(mes);
      const mapaVacaciones = await leerJSON(KEY_VACACIONES, {});
      const diasVacaciones = typeof mapaVacaciones[anio] === "number" ? mapaVacaciones[anio] : 34;
      const valorDiario = sueldoBase / 22;
      const valorNumero = Math.round(valorDiario * diasVacaciones);
      const diaISO = hoyISO();
      const notaTexto = "Vacaciones y festivos";

      await agregarEntradaConDatos(valorNumero, diaISO, notaTexto);
    } catch (e) {
      console.error("Error al calcular vacaciones:", e);
      Alert.alert("Error", "No se pudo calcular las vacaciones y festivos de ese mes.");
    } finally {
      setCalculandoRapido(false);
    }
  };

  const confirmarEntradaRapida = () => {
    const anio = anioParaMesElegido(mesRapido);
    const esVacaciones = tipoRapido === "vacaciones";
    Alert.alert(
      "Añadir entrada rápida",
      `¿Añadir ${esVacaciones ? "vacaciones y festivos" : "sueldo"} de ${MESES[mesRapido]} ${anio}?`,
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Añadir",
          onPress: () =>
            esVacaciones ? calcularYAgregarVacaciones(mesRapido) : calcularYAgregarSueldo(mesRapido)
        }
      ]
    );
  };

  const alternarArchivado = async (id) => {
    const entrada = entradas.find((e) => e.id === id);
    if (!entrada) return;
    const nuevoValor = !entrada.archivado;
    setEntradas((prev) => prev.map((e) => (e.id === id ? { ...e, archivado: nuevoValor } : e)));
    try {
      const actuales = await leerJSON(KEY_GASTOS, []);
      await guardarJSON(
        KEY_GASTOS,
        actuales.map((e) => (e.id === id ? { ...e, archivado: nuevoValor } : e))
      );
    } catch (e) {
      console.error("Error al actualizar:", e);
    }
  };

  const archivarTodo = async () => {
    setEntradas((prev) => prev.map((e) => ({ ...e, archivado: true })));
    try {
      const actuales = await leerJSON(KEY_GASTOS, []);
      await guardarJSON(KEY_GASTOS, actuales.map((e) => ({ ...e, archivado: true })));
    } catch (e) {
      console.error("Error al archivar todo:", e);
    }
  };

  const eliminarEntrada = (id) => {
    Alert.alert(
      "Eliminar entrada",
      "¿Seguro que quieres eliminar esta entrada? No se puede deshacer.",
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Eliminar",
          style: "destructive",
          onPress: async () => {
            setEntradas((prev) => prev.filter((e) => e.id !== id));
            try {
              const actuales = await leerJSON(KEY_GASTOS, []);
              await guardarJSON(KEY_GASTOS, actuales.filter((e) => e.id !== id));
            } catch (e) {
              console.error("Error al eliminar:", e);
            }
          }
        }
      ]
    );
  };

  const eliminarTodo = () => {
    Alert.alert(
      "Eliminar todo",
      "¿Seguro que quieres eliminar todas las entradas? Esta acción no se puede deshacer.",
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Eliminar todo",
          style: "destructive",
          onPress: async () => {
            setEntradas([]);
            try {
              await guardarJSON(KEY_GASTOS, []);
            } catch (e) {
              console.error("Error al eliminar todo:", e);
            }
          }
        }
      ]
    );
  };

  const totalDebido = useMemo(() => {
    let debe = 0;
    let pago = 0;
    entradas.forEach((e) => {
      if (e.archivado) return;
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
    ? `Blue dot debe ${formatoMoneda(totalDebido)}`
    : totalDebido < 0
      ? `Yo debo ${formatoMoneda(totalDebido)}`
      : "Todo saldado";

  // CORREÇÃO 2: Removida a dependência 'vacaciones' (mantendo apenas o entradas)
  const entradasVisibles = useMemo(() => {
    return entradas.filter((e) => mostrarArchivados || !e.archivado);
  }, [entradas, mostrarArchivados]);

  const hayArchivados = useMemo(() => {
    return entradas.some((e) => e.archivado);
  }, [entradas]);

  return (
    <View>
      <Text style={styles.tituloGastos}>Gastos y pagos</Text>

      {!isLocked && (
        <View style={styles.formCaja}>
          <Text style={styles.campoEtiqueta}>Entrada rápida</Text>

          <View style={styles.toggleFila}>
            <TouchableOpacity
              onPress={() => setTipoRapido("sueldo")}
              style={[styles.toggleBtn, tipoRapido === "sueldo" && styles.toggleBtnActivo]}
            >
              <Text style={[styles.toggleTexto, tipoRapido === "sueldo" && styles.toggleTextoActivo]}>
                Sueldo mensual
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setTipoRapido("vacaciones")}
              style={[styles.toggleBtn, tipoRapido === "vacaciones" && styles.toggleBtnActivo]}
            >
              <Text style={[styles.toggleTexto, tipoRapido === "vacaciones" && styles.toggleTextoActivo]}>
                Vacaciones y festivos
              </Text>
            </TouchableOpacity>
          </View>

          <View style={styles.mesesFila}>
            {MESES.map((nombreMes, i) => (
              <TouchableOpacity
                key={nombreMes}
                onPress={() => setMesRapido(i)}
                style={[styles.mesChip, mesRapido === i && styles.mesChipActivo]}
              >
                <Text style={[styles.mesChipTexto, mesRapido === i && styles.mesChipTextoActivo]}>
                  {nombreMes.slice(0, 3)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.textoAyuda}>
            {tipoRapido === "vacaciones"
              ? `Se añadirá con fecha de hoy (${hoyISO()})`
              : `Se añadirá con fecha ${ultimoDiaISO(anioParaMesElegido(mesRapido), mesRapido)}`}
          </Text>

          <TouchableOpacity
            onPress={confirmarEntradaRapida}
            style={[styles.botonAgregar, calculandoRapido && { opacity: 0.6 }]}
            disabled={calculandoRapido}
          >
            <Text style={styles.botonAgregarTexto}>
              {calculandoRapido ? "Calculando..." : "⚡ Calcular y añadir"}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {!isLocked && (
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

          <View style={styles.campo}>
            <Text style={styles.campoEtiqueta}>Foto (opcional)</Text>
            {imagen ? (
              <View style={styles.previaFotoFila}>
                <Image source={{ uri: imagen }} style={styles.previaFoto} />
                <TouchableOpacity onPress={() => setImagen(null)} style={styles.botonQuitarFoto}>
                  <Text style={styles.botonQuitarFotoTexto}>Eliminar</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity onPress={elegirImagen} style={styles.botonFoto}>
                <Text style={styles.botonFotoTexto}>📎 Añadir foto</Text>
              </TouchableOpacity>
            )}
          </View>

          <TouchableOpacity onPress={agregarEntrada} style={styles.botonAgregar}>
            <Text style={styles.botonAgregarTexto}>+ Añadir entrada</Text>
          </TouchableOpacity>
        </View>
      )}

      <View style={[styles.totalCaja, { borderColor: colorTotal }]}>
        <Text style={styles.totalEtiqueta}>Total</Text>
        <Text style={[styles.totalValor, { color: colorTotal }]}>{textoTotal}</Text>
      </View>

      {hayArchivados && (
        <View style={[styles.filaAcciones, { marginBottom: 10 }]}>
          <TouchableOpacity
            onPress={() => setMostrarArchivados((v) => !v)}
            style={styles.botonAccionSecundario}
          >
            <Text style={styles.botonAccionSecundarioTexto}>
              {mostrarArchivados ? "Ocultar archivados" : "Ver archivados"}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {!isLocked && (
        <View style={styles.filaAcciones}>
          <TouchableOpacity
            onPress={archivarTodo}
            style={styles.botonAccionSecundario}
            disabled={entradas.length === 0}
          >
            <Text style={styles.botonAccionSecundarioTexto}>Archivar todo</Text>
          </TouchableOpacity>
          
          <TouchableOpacity
            onPress={eliminarTodo}
            style={styles.botonAccionPeligro}
            disabled={entradas.length === 0}
          >
            <Text style={styles.botonAccionPeligroTexto}>Eliminar todo</Text>
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.listaGastos}>
        {entradasVisibles.length === 0 ? (
          <Text style={styles.listaVacia}>
            {entradas.length === 0
              ? "Todavía no hay entradas. Añade la primera arriba."
              : "No hay entradas para mostrar."}
          </Text>
        ) : (
          entradasVisibles.map((e, i) => (
            <TouchableOpacity
              key={e.id}
              activeOpacity={e.imagen ? 0.6 : 1}
              onPress={() => e.imagen && setImagenVisible(e.imagen)}
              style={[
                styles.filaGasto,
                i < entradasVisibles.length - 1 && styles.filaGastoBorde,
                e.archivado && styles.filaGastoArchivada
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
                  {!!e.imagen && <Text style={styles.iconoFoto}>📷</Text>}
                  {e.archivado && <Text style={styles.etiquetaArchivado}>Archivado</Text>}
                </View>
                <View style={styles.filaGastoDer}>
                  <Text style={styles.filaGastoValor}>{formatoMoneda(e.valor)}</Text>
                  {!isLocked && (
                    <>
                      <TouchableOpacity onPress={() => alternarArchivado(e.id)} style={styles.botonEliminar}>
                        <Text style={{ color: "#7A7461", fontSize: 13 }}>
                          {e.archivado ? "↺" : "🗄"}
                        </Text>
                      </TouchableOpacity>
                      
                      <TouchableOpacity onPress={() => eliminarEntrada(e.id)} style={styles.botonEliminar}>
                        <Text style={{ color: "#B33F3F", fontSize: 16 }}>×</Text>
                      </TouchableOpacity>
                    </>
                  )}
                </View>
              </View>
              {!!e.nota && <Text style={styles.filaGastoNota} numberOfLines={2}>{e.nota}</Text>}
            </TouchableOpacity>
          ))
        )}
      </View>

      <Modal
        visible={!!imagenVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setImagenVisible(null)}
      >
        <TouchableOpacity
          style={styles.modalFondo}
          activeOpacity={1}
          onPress={() => setImagenVisible(null)}
        >
          {!!imagenVisible && (
            <Image
              source={{ uri: imagenVisible }}
              style={styles.modalImagen}
              resizeMode="contain"
            />
          )}
          <TouchableOpacity onPress={() => setImagenVisible(null)} style={styles.modalCerrarBtn}>
            <Text style={styles.modalCerrarTexto}>Cerrar</Text>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
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
  indicadorFoto: {
    position: "absolute",
    bottom: 2,
    right: 4,
    fontSize: 9
  },
  cajaModalFotos: {
    width: "100%",
    maxWidth: 340,
    maxHeight: "80%",
    backgroundColor: "#F7F4EA",
    borderRadius: 12,
    padding: 20,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#DAD5C4"
  },
  cabeceraModalFotos: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 15,
    position: "relative"
  },
  botonXFotos: {
    position: "absolute",
    right: 0,
    top: -4,
    padding: 6
  },
  botonXFotosTexto: { fontSize: 16, color: "#5C5745", fontWeight: "700" },
  scrollFotos: { width: "100%", maxHeight: 320, marginTop: 6 },
  grillaFotos: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    justifyContent: "flex-start"
  },
  miniFoto: {
    width: 90,
    height: 90,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#DAD5C4"
  },
  miniFotoWrap: {
    width: 90,
    height: 90
  },
  botonXMiniFoto: {
    position: "absolute",
    top: -6,
    right: -6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#A83B32",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: "#F7F4EA"
  },
  botonXMiniFotoTexto: { color: "#F7F4EA", fontSize: 11, fontWeight: "700" },

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

  mesesFila: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 10,
    marginBottom: 4
  },
  mesChip: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: "#DAD5C4",
    backgroundColor: "#FFFFFF"
  },
  mesChipActivo: { backgroundColor: "#2B2820", borderColor: "#2B2820" },
  mesChipTexto: { fontSize: 12, color: "#5C5745", fontWeight: "600" },
  mesChipTextoActivo: { color: "#F3F1E7" },

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
  inputBloqueado: { opacity: 0.5 },
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
  filaGastoIzq: { flexDirection: "row", alignItems: "center", gap: 6, flexShrink: 1, marginRight: 10 },
  filaGastoDer: { flexDirection: "row", alignItems: "center", gap: 14 },
  badge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 20 },
  badgeTexto: { fontSize: 10, fontWeight: "700", color: "#F3F1E7" },
  filaGastoFecha: { fontSize: 11.5, color: "#9B9581" },
  filaGastoValor: { fontSize: 13.5, fontWeight: "700", color: "#2B2820", marginRight: 2 },
  botonEliminar: { padding: 6 },
  filaGastoNota: { fontSize: 11.5, color: "#5C5745", marginTop: 4, lineHeight: 16 },

  filaAcciones: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 },
  botonAccionSecundario: {
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: "#DAD5C4",
    backgroundColor: "#F7F4EA"
  },
  botonAccionSecundarioTexto: { fontSize: 11.5, color: "#5C5745", fontWeight: "600" },
  botonAccionPeligro: {
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: "#E3B8B2",
    backgroundColor: "#FBEDEB"
  },
  botonAccionPeligroTexto: { fontSize: 11.5, color: "#A83B32", fontWeight: "600" },

  filaGastoArchivada: { opacity: 0.55 },
  etiquetaArchivado: {
    fontSize: 10,
    color: "#9B9581",
    fontStyle: "italic",
    marginLeft: 4
  },

  botonFoto: {
    borderWidth: 1,
    borderColor: "#DAD5C4",
    borderRadius: 7,
    backgroundColor: "#FFFFFF",
    paddingVertical: 9,
    alignItems: "center"
  },
  botonFotoTexto: { fontSize: 12.5, color: "#5C5745", fontWeight: "600" },
  previaFotoFila: { flexDirection: "row", alignItems: "center", gap: 10 },
  previaFoto: {
    width: 56,
    height: 56,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#DAD5C4"
  },
  botonQuitarFoto: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: "#E3B8B2",
    backgroundColor: "#FBEDEB"
  },
  botonQuitarFotoTexto: { fontSize: 11.5, color: "#A83B32", fontWeight: "600" },

  iconoFoto: { fontSize: 12, marginLeft: 4, marginRight: 2 },

  modalFondo: {
    flex: 1,
    backgroundColor: "rgba(20,18,12,0.92)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24
  },
  modalImagen: { width: "100%", height: "75%" },
  modalCerrarBtn: {
    marginTop: 18,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    backgroundColor: "#F3F1E7"
  },
  modalCerrarTexto: { color: "#2B2820", fontWeight: "700", fontSize: 13 },
  containerLock: {
    alignItems: 'center',
    marginVertical: 10,
  },
  areaBotao: {
    width: 150,
  },
  modalLockFundo: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalLockCaja: {
    width: 280,
    backgroundColor: '#F7F4EA',
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#DAD5C4',
  },
  modalLockTitulo: {
    fontSize: 16,
    fontWeight: '700',
    color: '#2B2820',
    marginBottom: 15,
  },
  modalLockInput: {
    width: '100%',
    height: 45,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#DAD5C4',
    borderRadius: 8,
    paddingHorizontal: 12,
    textAlign: 'center',
    fontSize: 16,
    color: '#2B2820',
    marginBottom: 20,
  },
  modalLockBotoes: {
    flexDirection: 'row',
    gap: 10,
  },
  modalLockBtn: {
    flex: 1,
    height: 40,
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  botaoLockCustom: {
    width: 45,
    height: 40,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 1.41,
  },
  botaoLockTextoCustom: {
    color: '#F3F1E7',
    fontWeight: '700',
    fontSize: 14,
    letterSpacing: 0.5,
  }
});