import React, { useState, useEffect, useCallback, useMemo } from "react";
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
  KeyboardAvoidingView
} from "react-native";
import { StatusBar } from "expo-status-bar";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "./supabaseClient";

const DEVICE_ID_KEY = "dispositivo-id";

function gerarId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

async function obterDeviceId() {
  let id = await AsyncStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    id = gerarId();
    await AsyncStorage.setItem(DEVICE_ID_KEY, id);
  }
  return id;
}

function formatoMoeda(valor) {
  const numero = Number(valor) || 0;
  const sinal = numero < 0 ? "-" : "";
  const partes = Math.abs(numero).toFixed(2).split(".");
  const inteiro = partes[0].replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return `${sinal}${inteiro},${partes[1]}€`;
}

function hojeISO() {
  const d = new Date();
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mes}-${dia}`;
}

// Algoritmo clássico de simplificação de dívidas: junta os maiores credores
// com os maiores devedores até saldar tudo, minimizando o nº de transferências.
function simplificarDividas(saldos) {
  const credores = [];
  const devedores = [];
  Object.entries(saldos).forEach(([id, valor]) => {
    if (valor > 0.01) credores.push({ id, valor });
    else if (valor < -0.01) devedores.push({ id, valor: -valor });
  });
  credores.sort((a, b) => b.valor - a.valor);
  devedores.sort((a, b) => b.valor - a.valor);

  const transacoes = [];
  let i = 0;
  let j = 0;
  while (i < devedores.length && j < credores.length) {
    const pagar = Math.min(devedores[i].valor, credores[j].valor);
    if (pagar > 0.01) {
      transacoes.push({ de: devedores[i].id, para: credores[j].id, valor: pagar });
    }
    devedores[i].valor -= pagar;
    credores[j].valor -= pagar;
    if (devedores[i].valor < 0.01) i += 1;
    if (credores[j].valor < 0.01) j += 1;
  }
  return transacoes;
}

// Divide um valor total entre N pessoas em partes iguais, distribuindo os
// cêntimos de resto pelas primeiras pessoas para o total bater sempre certo.
function dividirIgual(total, participantesIds) {
  const n = participantesIds.length;
  if (n === 0) return {};
  const centavosTotais = Math.round(total * 100);
  const base = Math.floor(centavosTotais / n);
  const resto = centavosTotais - base * n;
  const resultado = {};
  participantesIds.forEach((id, idx) => {
    const centavos = base + (idx < resto ? 1 : 0);
    resultado[id] = centavos / 100;
  });
  return resultado;
}

export default function App() {
  const [deviceId, setDeviceId] = useState(null);
  const [grupoAberto, setGrupoAberto] = useState(null);

  useEffect(() => {
    obterDeviceId().then(setDeviceId);
  }, []);

  if (!deviceId) {
    return <SafeAreaView style={styles.safe} />;
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="dark" />
      {grupoAberto ? (
        <TelaGrupo
          grupo={grupoAberto}
          deviceId={deviceId}
          onVoltar={() => setGrupoAberto(null)}
        />
      ) : (
        <TelaGrupos deviceId={deviceId} onAbrirGrupo={setGrupoAberto} />
      )}
    </SafeAreaView>
  );
}

function TelaGrupos({ onAbrirGrupo }) {
  const [grupos, setGrupos] = useState([]);
  const [carregado, setCarregado] = useState(false);
  const [modalVisivel, setModalVisivel] = useState(false);
  const [nomeNovoGrupo, setNomeNovoGrupo] = useState("");
  const [mostrarArquivados, setMostrarArquivados] = useState(false);

  const carregarGrupos = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("grupos")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      if (data) setGrupos(data);
    } catch (e) {
      console.error("Erro ao carregar grupos:", e);
    } finally {
      setCarregado(true);
    }
  }, []);

  useEffect(() => {
    carregarGrupos();
    const canal = supabase
      .channel("grupos_alteracoes")
      .on("postgres_changes", { event: "*", schema: "public", table: "grupos" }, () => {
        carregarGrupos();
      })
      .subscribe();
    return () => supabase.removeChannel(canal);
  }, [carregarGrupos]);

  const criarGrupo = async () => {
    const nome = nomeNovoGrupo.trim();
    if (!nome) return;
    try {
      const { data, error } = await supabase
        .from("grupos")
        .insert({ nome })
        .select()
        .single();
      if (error) throw error;
      setNomeNovoGrupo("");
      setModalVisivel(false);
      if (data) onAbrirGrupo(data);
    } catch (e) {
      console.error("Erro ao criar grupo:", e);
      Alert.alert("Erro", "Não foi possível criar o grupo. Tenta outra vez.");
    }
  };

  const gruposVisiveis = grupos.filter((g) => !!g.archivado === mostrarArquivados);

  return (
    <View style={styles.flex1}>
      <View style={styles.cabecalho}>
        <Text style={styles.tituloApp}>Contas Partilhadas</Text>
      </View>

      <ScrollView contentContainerStyle={styles.listaGruposContainer}>
        {carregado && gruposVisiveis.length === 0 && (
          <Text style={styles.textoVazio}>
            {mostrarArquivados ? "Sem grupos arquivados." : "Ainda não há grupos. Cria o primeiro!"}
          </Text>
        )}
        {gruposVisiveis.map((g) => (
          <TouchableOpacity
            key={g.id}
            style={styles.cartaoGrupo}
            onPress={() => onAbrirGrupo(g)}
          >
            <Text style={styles.cartaoGrupoTexto}>{g.nome}</Text>
            <Text style={styles.cartaoGrupoSeta}>›</Text>
          </TouchableOpacity>
        ))}

        {grupos.some((g) => g.archivado) && (
          <TouchableOpacity onPress={() => setMostrarArquivados((v) => !v)}>
            <Text style={styles.seccaoAcao}>
              {mostrarArquivados ? "Ver grupos ativos" : "Ver grupos arquivados"}
            </Text>
          </TouchableOpacity>
        )}
      </ScrollView>

      <TouchableOpacity style={styles.botaoFlutuante} onPress={() => setModalVisivel(true)}>
        <Text style={styles.botaoFlutuanteTexto}>+ Novo grupo</Text>
      </TouchableOpacity>

      <Modal visible={modalVisivel} transparent animationType="fade">
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.modalFundo}
        >
          <View style={styles.modalCaixa}>
            <Text style={styles.modalTitulo}>Novo grupo</Text>
            <TextInput
              style={styles.input}
              placeholder="Nome do grupo (ex: Viagem Porto)"
              placeholderTextColor="#9C9484"
              value={nomeNovoGrupo}
              onChangeText={setNomeNovoGrupo}
              autoFocus
            />
            <View style={styles.modalBotoes}>
              <TouchableOpacity
                style={styles.modalBotaoSecundario}
                onPress={() => {
                  setModalVisivel(false);
                  setNomeNovoGrupo("");
                }}
              >
                <Text style={styles.modalBotaoSecundarioTexto}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalBotaoPrimario} onPress={criarGrupo}>
                <Text style={styles.modalBotaoPrimarioTexto}>Criar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

function TelaGrupo({ grupo, deviceId, onVoltar }) {
  const [pessoas, setPessoas] = useState([]);
  const [despesas, setDespesas] = useState([]);
  const [modalPessoaVisivel, setModalPessoaVisivel] = useState(false);
  const [nomeNovaPessoa, setNomeNovaPessoa] = useState("");
  const [modalDespesaVisivel, setModalDespesaVisivel] = useState(false);
  const [despesaEditar, setDespesaEditar] = useState(null);
  const [mostrarArquivadas, setMostrarArquivadas] = useState(false);
  const [modalRenomearVisivel, setModalRenomearVisivel] = useState(false);
  const [nomeAtual, setNomeAtual] = useState(grupo.nome);
  const [nomeEditado, setNomeEditado] = useState(grupo.nome);

  const carregarPessoas = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("pessoas")
        .select("*")
        .eq("grupo_id", grupo.id)
        .order("created_at", { ascending: true });
      if (error) throw error;
      if (data) setPessoas(data);
    } catch (e) {
      console.error("Erro ao carregar pessoas:", e);
    }
  }, [grupo.id]);

  const carregarDespesas = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("despesas")
        .select("*, despesas_divisao(*)")
        .eq("grupo_id", grupo.id)
        .order("data", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      if (data) setDespesas(data);
    } catch (e) {
      console.error("Erro ao carregar despesas:", e);
    }
  }, [grupo.id]);

  useEffect(() => {
    carregarPessoas();
    carregarDespesas();

    const canal = supabase
      .channel(`grupo_${grupo.id}_alteracoes`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "pessoas", filter: `grupo_id=eq.${grupo.id}` },
        () => carregarPessoas()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "despesas", filter: `grupo_id=eq.${grupo.id}` },
        () => carregarDespesas()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "despesas_divisao", filter: `grupo_id=eq.${grupo.id}` },
        () => carregarDespesas()
      )
      .subscribe();

    return () => supabase.removeChannel(canal);
  }, [grupo.id, carregarPessoas, carregarDespesas]);

  const nomePessoa = useCallback(
    (id) => pessoas.find((p) => p.id === id)?.nome || "Alguém",
    [pessoas]
  );

  const saldos = useMemo(() => {
    const s = {};
    pessoas.forEach((p) => {
      s[p.id] = 0;
    });
    despesas.forEach((d) => {
      if (d.archivado) return;
      s[d.pago_por] = (s[d.pago_por] || 0) + Number(d.valor);
      (d.despesas_divisao || []).forEach((div) => {
        s[div.pessoa_id] = (s[div.pessoa_id] || 0) - Number(div.valor);
      });
    });
    return s;
  }, [pessoas, despesas]);

  const transacoes = useMemo(() => simplificarDividas(saldos), [saldos]);

  const adicionarPessoa = async () => {
    const nome = nomeNovaPessoa.trim();
    if (!nome) return;
    try {
      const { error } = await supabase.from("pessoas").insert({ grupo_id: grupo.id, nome });
      if (error) throw error;
      setNomeNovaPessoa("");
      setModalPessoaVisivel(false);
    } catch (e) {
      console.error("Erro ao adicionar pessoa:", e);
      Alert.alert("Erro", "Não foi possível adicionar a pessoa.");
    }
  };

  const registarPagamento = (t) => {
    Alert.alert(
      "Registar pagamento",
      `${nomePessoa(t.de)} paga ${formatoMoeda(t.valor)} a ${nomePessoa(t.para)}?`,
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "OK",
          onPress: async () => {
            try {
              const { data: novaDespesa, error } = await supabase
                .from("despesas")
                .insert({
                  grupo_id: grupo.id,
                  descricao: "Pagamento",
                  valor: t.valor,
                  pago_por: t.de,
                  tipo_divisao: "valores",
                  data: hojeISO(),
                  criado_por: deviceId
                })
                .select()
                .single();
              if (error) throw error;

              const { error: erroDivisao } = await supabase.from("despesas_divisao").insert({
                despesa_id: novaDespesa.id,
                grupo_id: grupo.id,
                pessoa_id: t.para,
                valor: t.valor
              });
              if (erroDivisao) throw erroDivisao;
            } catch (e) {
              console.error("Erro ao registar pagamento:", e);
              Alert.alert("Erro", "Não foi possível registar o pagamento.");
            }
          }
        }
      ]
    );
  };

  // Sempre que as despesas mudam (novo pagamento, edição, remoção...), verifica
  // se as contas do grupo ficaram todas a zero — se sim, arquiva o histórico.
  useEffect(() => {
    const temDespesasAtivas = despesas.some((d) => !d.archivado);
    if (temDespesasAtivas && transacoes.length === 0) {
      supabase
        .from("despesas")
        .update({ archivado: true })
        .eq("grupo_id", grupo.id)
        .eq("archivado", false)
        .then(({ error }) => {
          if (error) console.error("Erro ao arquivar despesas:", error);
        });
    }
  }, [despesas, transacoes, grupo.id]);

  const renomearGrupo = () => {
    const nome = nomeEditado.trim();
    if (!nome || nome === nomeAtual) {
      setModalRenomearVisivel(false);
      return;
    }
    Alert.alert("Confirmar alteração", `Mudar o nome do grupo para "${nome}"?`, [
      { text: "Cancelar", style: "cancel" },
      {
        text: "OK",
        onPress: async () => {
          try {
            const { error } = await supabase.from("grupos").update({ nome }).eq("id", grupo.id);
            if (error) throw error;
            setNomeAtual(nome);
            setModalRenomearVisivel(false);
          } catch (e) {
            console.error("Erro ao renomear grupo:", e);
            Alert.alert("Erro", "Não foi possível renomear o grupo.");
          }
        }
      }
    ]);
  };

  const arquivarGrupo = () => {
    Alert.alert(
      "Arquivar grupo",
      `Tens a certeza que queres arquivar "${nomeAtual}"? Deixa de aparecer na lista principal, mas os dados não se perdem.`,
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Arquivar",
          style: "destructive",
          onPress: async () => {
            try {
              const { error } = await supabase
                .from("grupos")
                .update({ archivado: true })
                .eq("id", grupo.id);
              if (error) throw error;
              onVoltar();
            } catch (e) {
              console.error("Erro ao arquivar grupo:", e);
              Alert.alert("Erro", "Não foi possível arquivar o grupo.");
            }
          }
        }
      ]
    );
  };

  const apagarDespesa = (despesa) => {
    Alert.alert("Apagar despesa", `Apagar "${despesa.descricao}"? Não se pode desfazer.`, [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Apagar",
        style: "destructive",
        onPress: async () => {
          try {
            const { error } = await supabase.from("despesas").delete().eq("id", despesa.id);
            if (error) throw error;
          } catch (e) {
            console.error("Erro ao apagar despesa:", e);
            Alert.alert("Erro", "Não foi possível apagar a despesa.");
          }
        }
      }
    ]);
  };

  return (
    <View style={styles.flex1}>
      <View style={styles.cabecalhoGrupo}>
        <TouchableOpacity onPress={onVoltar} style={styles.botaoVoltar}>
          <Text style={styles.botaoVoltarTexto}>‹ Grupos</Text>
        </TouchableOpacity>
        <Text style={styles.tituloGrupo} numberOfLines={1}>
          {nomeAtual}
        </Text>
        <View style={styles.cabecalhoGrupoAcoes}>
          <TouchableOpacity
            onPress={() => {
              setNomeEditado(nomeAtual);
              setModalRenomearVisivel(true);
            }}
          >
            <Text style={styles.seccaoAcao}>Editar</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={arquivarGrupo}>
            <Text style={[styles.seccaoAcao, styles.itemDespesaBotaoApagar]}>Arquivar</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.conteudoScroll}>
        <View style={styles.resumoCaixa}>
          <Text style={styles.resumoTitulo}>Quem deve a quem</Text>
          {transacoes.length === 0 ? (
            <Text style={styles.resumoTudoOk}>Tudo em dia! 🎉</Text>
          ) : (
            transacoes.map((t, i) => (
              <TouchableOpacity
                key={i}
                style={styles.resumoLinha}
                onPress={() => registarPagamento(t)}
              >
                <Text style={styles.resumoTexto}>
                  <Text style={styles.resumoNome}>{nomePessoa(t.de)}</Text> deve{" "}
                  <Text style={styles.resumoValor}>{formatoMoeda(t.valor)}</Text> a{" "}
                  <Text style={styles.resumoNome}>{nomePessoa(t.para)}</Text>
                </Text>
              </TouchableOpacity>
            ))
          )}
        </View>

        <View style={styles.seccao}>
          <View style={styles.seccaoCabecalho}>
            <Text style={styles.seccaoTitulo}>Pessoas</Text>
            <TouchableOpacity onPress={() => setModalPessoaVisivel(true)}>
              <Text style={styles.seccaoAcao}>+ Adicionar</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.chipsLinha}>
            {pessoas.length === 0 && (
              <Text style={styles.textoVazio}>Ainda sem pessoas neste grupo.</Text>
            )}
            {pessoas.map((p) => (
              <View key={p.id} style={styles.chipPessoa}>
                <Text style={styles.chipPessoaTexto}>{p.nome}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.seccao}>
          <View style={styles.seccaoCabecalho}>
            <Text style={styles.seccaoTitulo}>Despesas</Text>
            <TouchableOpacity
              onPress={() => {
                if (pessoas.length === 0) {
                  Alert.alert("Adiciona pessoas primeiro", "Precisas de pelo menos uma pessoa no grupo.");
                  return;
                }
                setDespesaEditar(null);
                setModalDespesaVisivel(true);
              }}
            >
              <Text style={styles.seccaoAcao}>+ Nova despesa</Text>
            </TouchableOpacity>
          </View>

          {despesas.length === 0 && (
            <Text style={styles.textoVazio}>Ainda sem despesas.</Text>
          )}

          {despesas
            .filter((d) => !!d.archivado === mostrarArquivadas)
            .map((d) => (
            <View key={d.id} style={styles.itemDespesa}>
              <View style={styles.itemDespesaTop}>
                <Text style={styles.itemDespesaDescricao} numberOfLines={1}>
                  {d.descricao}
                </Text>
                <Text style={styles.itemDespesaValor}>{formatoMoeda(d.valor)}</Text>
              </View>
              <View style={styles.itemDespesaBaixo}>
                <Text style={styles.itemDespesaDetalhe}>
                  {nomePessoa(d.pago_por)} pagou · {d.data}
                </Text>
                {d.criado_por === deviceId && !d.archivado && (
                  <View style={styles.itemDespesaAcoes}>
                    <TouchableOpacity
                      onPress={() => {
                        setDespesaEditar(d);
                        setModalDespesaVisivel(true);
                      }}
                      style={styles.itemDespesaBotao}
                    >
                      <Text style={styles.itemDespesaBotaoTexto}>Editar</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => apagarDespesa(d)} style={styles.itemDespesaBotao}>
                      <Text style={[styles.itemDespesaBotaoTexto, styles.itemDespesaBotaoApagar]}>
                        Apagar
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            </View>
          ))}

          {despesas.some((d) => d.archivado) && (
            <TouchableOpacity onPress={() => setMostrarArquivadas((v) => !v)}>
              <Text style={styles.seccaoAcao}>
                {mostrarArquivadas ? "Ver despesas ativas" : "Ver histórico arquivado"}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>

      <Modal visible={modalRenomearVisivel} transparent animationType="fade">
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.modalFundo}
        >
          <View style={styles.modalCaixa}>
            <Text style={styles.modalTitulo}>Editar nome do grupo</Text>
            <TextInput
              style={styles.input}
              placeholder="Nome do grupo"
              placeholderTextColor="#9C9484"
              value={nomeEditado}
              onChangeText={setNomeEditado}
              autoFocus
            />
            <View style={styles.modalBotoes}>
              <TouchableOpacity
                style={styles.modalBotaoSecundario}
                onPress={() => setModalRenomearVisivel(false)}
              >
                <Text style={styles.modalBotaoSecundarioTexto}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalBotaoPrimario} onPress={renomearGrupo}>
                <Text style={styles.modalBotaoPrimarioTexto}>Guardar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={modalPessoaVisivel} transparent animationType="fade">
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.modalFundo}
        >
          <View style={styles.modalCaixa}>
            <Text style={styles.modalTitulo}>Nova pessoa</Text>
            <TextInput
              style={styles.input}
              placeholder="Nome"
              placeholderTextColor="#9C9484"
              value={nomeNovaPessoa}
              onChangeText={setNomeNovaPessoa}
              autoFocus
            />
            <View style={styles.modalBotoes}>
              <TouchableOpacity
                style={styles.modalBotaoSecundario}
                onPress={() => {
                  setModalPessoaVisivel(false);
                  setNomeNovaPessoa("");
                }}
              >
                <Text style={styles.modalBotaoSecundarioTexto}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalBotaoPrimario} onPress={adicionarPessoa}>
                <Text style={styles.modalBotaoPrimarioTexto}>Adicionar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {modalDespesaVisivel && (
        <ModalDespesa
          visivel={modalDespesaVisivel}
          grupoId={grupo.id}
          deviceId={deviceId}
          pessoas={pessoas}
          despesaEditar={despesaEditar}
          onFechar={() => {
            setModalDespesaVisivel(false);
            setDespesaEditar(null);
          }}
        />
      )}
    </View>
  );
}

const TIPOS_DIVISAO = [
  { valor: "igual", etiqueta: "Igual" },
  { valor: "valores", etiqueta: "Valores" },
  { valor: "percentagens", etiqueta: "%" }
];

function ModalDespesa({ visivel, grupoId, deviceId, pessoas, despesaEditar, onFechar }) {
  const editando = !!despesaEditar;

  const [descricao, setDescricao] = useState(despesaEditar?.descricao || "");
  const [valor, setValor] = useState(despesaEditar ? String(despesaEditar.valor) : "");
  const [data, setData] = useState(despesaEditar?.data || hojeISO());
  const [pagoPor, setPagoPor] = useState(
    despesaEditar?.pago_por || (pessoas[0] ? pessoas[0].id : null)
  );
  const [tipoDivisao, setTipoDivisao] = useState(despesaEditar?.tipo_divisao || "igual");
  const [participantes, setParticipantes] = useState(() => {
    if (despesaEditar) {
      return new Set((despesaEditar.despesas_divisao || []).map((d) => d.pessoa_id));
    }
    return new Set(pessoas.map((p) => p.id));
  });
  const [valoresPersonalizados, setValoresPersonalizados] = useState(() => {
    const inicial = {};
    if (despesaEditar) {
      (despesaEditar.despesas_divisao || []).forEach((d) => {
        inicial[d.pessoa_id] = String(d.valor);
      });
    }
    return inicial;
  });
  const [percentagens, setPercentagens] = useState(() => {
    const inicial = {};
    if (despesaEditar && despesaEditar.tipo_divisao === "percentagens") {
      const total = Number(despesaEditar.valor) || 1;
      (despesaEditar.despesas_divisao || []).forEach((d) => {
        inicial[d.pessoa_id] = String(((Number(d.valor) / total) * 100).toFixed(2));
      });
    }
    return inicial;
  });
  const [aGuardar, setAGuardar] = useState(false);

  const alternarParticipante = (id) => {
    setParticipantes((prev) => {
      const copia = new Set(prev);
      if (copia.has(id)) copia.delete(id);
      else copia.add(id);
      return copia;
    });
  };

  const totalNumero = parseFloat(valor.replace(",", ".")) || 0;

  const somaValoresPersonalizados = useMemo(() => {
    let soma = 0;
    pessoas.forEach((p) => {
      if (participantes.has(p.id)) {
        soma += parseFloat((valoresPersonalizados[p.id] || "0").replace(",", ".")) || 0;
      }
    });
    return soma;
  }, [valoresPersonalizados, participantes, pessoas]);

  const somaPercentagens = useMemo(() => {
    let soma = 0;
    pessoas.forEach((p) => {
      if (participantes.has(p.id)) {
        soma += parseFloat((percentagens[p.id] || "0").replace(",", ".")) || 0;
      }
    });
    return soma;
  }, [percentagens, participantes, pessoas]);

  const guardar = async () => {
    const descricaoLimpa = descricao.trim();
    const participantesIds = pessoas.filter((p) => participantes.has(p.id)).map((p) => p.id);

    if (!descricaoLimpa) {
      Alert.alert("Falta a descrição", "Dá um nome à despesa.");
      return;
    }
    if (!totalNumero || totalNumero <= 0) {
      Alert.alert("Valor inválido", "Introduz um valor maior que zero.");
      return;
    }
    if (!pagoPor) {
      Alert.alert("Falta quem pagou", "Escolhe quem pagou a despesa.");
      return;
    }
    if (participantesIds.length === 0) {
      Alert.alert("Falta quem participa", "Escolhe pelo menos uma pessoa na divisão.");
      return;
    }
    if (tipoDivisao === "valores" && Math.abs(somaValoresPersonalizados - totalNumero) > 0.01) {
      Alert.alert(
        "Valores não batem certo",
        `A soma dos valores (${formatoMoeda(somaValoresPersonalizados)}) tem de ser igual ao total (${formatoMoeda(totalNumero)}).`
      );
      return;
    }
    if (tipoDivisao === "percentagens" && Math.abs(somaPercentagens - 100) > 0.5) {
      Alert.alert(
        "Percentagens não somam 100%",
        `As percentagens somam ${somaPercentagens.toFixed(1)}%, têm de somar 100%.`
      );
      return;
    }

    let divisaoFinal = {};
    if (tipoDivisao === "igual") {
      divisaoFinal = dividirIgual(totalNumero, participantesIds);
    } else if (tipoDivisao === "valores") {
      participantesIds.forEach((id) => {
        divisaoFinal[id] = parseFloat((valoresPersonalizados[id] || "0").replace(",", ".")) || 0;
      });
    } else {
      participantesIds.forEach((id) => {
        const pct = parseFloat((percentagens[id] || "0").replace(",", ".")) || 0;
        divisaoFinal[id] = Math.round(((totalNumero * pct) / 100) * 100) / 100;
      });
    }

    setAGuardar(true);
    try {
      let despesaId = despesaEditar?.id;
      if (editando) {
        const { error } = await supabase
          .from("despesas")
          .update({
            descricao: descricaoLimpa,
            valor: totalNumero,
            pago_por: pagoPor,
            tipo_divisao: tipoDivisao,
            data
          })
          .eq("id", despesaId);
        if (error) throw error;
        await supabase.from("despesas_divisao").delete().eq("despesa_id", despesaId);
      } else {
        const { data: novaDespesa, error } = await supabase
          .from("despesas")
          .insert({
            grupo_id: grupoId,
            descricao: descricaoLimpa,
            valor: totalNumero,
            pago_por: pagoPor,
            tipo_divisao: tipoDivisao,
            data,
            criado_por: deviceId
          })
          .select()
          .single();
        if (error) throw error;
        despesaId = novaDespesa.id;
      }

      const linhasDivisao = Object.entries(divisaoFinal).map(([pessoaId, val]) => ({
        despesa_id: despesaId,
        grupo_id: grupoId,
        pessoa_id: pessoaId,
        valor: val
      }));
      const { error: erroDivisao } = await supabase.from("despesas_divisao").insert(linhasDivisao);
      if (erroDivisao) throw erroDivisao;

      onFechar();
    } catch (e) {
      console.error("Erro ao guardar despesa:", e);
      Alert.alert("Erro", "Não foi possível guardar a despesa.");
    } finally {
      setAGuardar(false);
    }
  };

  return (
    <Modal visible={visivel} transparent animationType="slide">
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.modalFundo}
      >
        <View style={styles.modalCaixaGrande}>
          <ScrollView keyboardShouldPersistTaps="handled">
            <Text style={styles.modalTitulo}>{editando ? "Editar despesa" : "Nova despesa"}</Text>

            <Text style={styles.rotulo}>Descrição</Text>
            <TextInput
              style={styles.input}
              placeholder="Ex: Jantar, Combustível..."
              placeholderTextColor="#9C9484"
              value={descricao}
              onChangeText={setDescricao}
            />

            <Text style={styles.rotulo}>Valor total</Text>
            <TextInput
              style={styles.input}
              placeholder="0.00"
              placeholderTextColor="#9C9484"
              keyboardType="decimal-pad"
              value={valor}
              onChangeText={setValor}
            />

            <Text style={styles.rotulo}>Data</Text>
            <TextInput
              style={styles.input}
              placeholder="AAAA-MM-DD"
              placeholderTextColor="#9C9484"
              value={data}
              onChangeText={setData}
            />

            <Text style={styles.rotulo}>Quem pagou</Text>
            <View style={styles.chipsLinha}>
              {pessoas.map((p) => (
                <TouchableOpacity
                  key={p.id}
                  style={[styles.chipSelecionavel, pagoPor === p.id && styles.chipSelecionado]}
                  onPress={() => setPagoPor(p.id)}
                >
                  <Text
                    style={[
                      styles.chipSelecionavelTexto,
                      pagoPor === p.id && styles.chipSelecionadoTexto
                    ]}
                  >
                    {p.nome}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.rotulo}>Como dividir</Text>
            <View style={styles.segmentado}>
              {TIPOS_DIVISAO.map((t) => (
                <TouchableOpacity
                  key={t.valor}
                  style={[styles.segmentadoBotao, tipoDivisao === t.valor && styles.segmentadoBotaoAtivo]}
                  onPress={() => setTipoDivisao(t.valor)}
                >
                  <Text
                    style={[
                      styles.segmentadoBotaoTexto,
                      tipoDivisao === t.valor && styles.segmentadoBotaoTextoAtivo
                    ]}
                  >
                    {t.etiqueta}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.rotulo}>Entre quem</Text>
            {pessoas.map((p) => {
              const selecionado = participantes.has(p.id);
              return (
                <View key={p.id} style={styles.linhaParticipante}>
                  <TouchableOpacity
                    style={styles.linhaParticipanteNome}
                    onPress={() => alternarParticipante(p.id)}
                  >
                    <View style={[styles.caixaSelecao, selecionado && styles.caixaSelecaoAtiva]}>
                      {selecionado && <Text style={styles.caixaSelecaoMarca}>✓</Text>}
                    </View>
                    <Text style={styles.linhaParticipanteTexto}>{p.nome}</Text>
                  </TouchableOpacity>

                  {selecionado && tipoDivisao === "valores" && (
                    <TextInput
                      style={styles.inputPequeno}
                      placeholder="0.00"
                      placeholderTextColor="#9C9484"
                      keyboardType="decimal-pad"
                      value={valoresPersonalizados[p.id] || ""}
                      onChangeText={(t) =>
                        setValoresPersonalizados((prev) => ({ ...prev, [p.id]: t }))
                      }
                    />
                  )}
                  {selecionado && tipoDivisao === "percentagens" && (
                    <TextInput
                      style={styles.inputPequeno}
                      placeholder="0%"
                      placeholderTextColor="#9C9484"
                      keyboardType="decimal-pad"
                      value={percentagens[p.id] || ""}
                      onChangeText={(t) => setPercentagens((prev) => ({ ...prev, [p.id]: t }))}
                    />
                  )}
                </View>
              );
            })}

            {tipoDivisao === "valores" && (
              <Text style={styles.textoAjudaSoma}>
                Soma: {formatoMoeda(somaValoresPersonalizados)} de {formatoMoeda(totalNumero)}
              </Text>
            )}
            {tipoDivisao === "percentagens" && (
              <Text style={styles.textoAjudaSoma}>Soma: {somaPercentagens.toFixed(1)}% de 100%</Text>
            )}

            <View style={styles.modalBotoes}>
              <TouchableOpacity style={styles.modalBotaoSecundario} onPress={onFechar}>
                <Text style={styles.modalBotaoSecundarioTexto}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalBotaoPrimario}
                onPress={guardar}
                disabled={aGuardar}
              >
                <Text style={styles.modalBotaoPrimarioTexto}>
                  {aGuardar ? "A guardar..." : editando ? "Guardar" : "Adicionar"}
                </Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#F7F3EA" },
  flex1: { flex: 1 },

  cabecalho: {
    paddingHorizontal: 20,
    paddingTop: 44,
    paddingBottom: 16
  },
  tituloApp: { fontSize: 24, fontWeight: "700", color: "#2B2820" },

  listaGruposContainer: { paddingHorizontal: 20, paddingBottom: 100, gap: 10 },
  textoVazio: { color: "#8A8270", fontSize: 13.5, paddingVertical: 8 },

  cartaoGrupo: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: "#EAE2CF"
  },
  cartaoGrupoTexto: { fontSize: 16, fontWeight: "600", color: "#2B2820" },
  cartaoGrupoSeta: { fontSize: 20, color: "#B7AE97" },

  botaoFlutuante: {
    position: "absolute",
    bottom: 24,
    left: 20,
    right: 20,
    backgroundColor: "#3F6B4F",
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: "center"
  },
  botaoFlutuanteTexto: { color: "#FFFFFF", fontWeight: "700", fontSize: 15.5 },

  cabecalhoGrupo: {
    paddingHorizontal: 20,
    paddingTop: 44,
    paddingBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 10
  },
  botaoVoltar: { paddingVertical: 4, paddingRight: 4 },
  botaoVoltarTexto: { color: "#3F6B4F", fontSize: 15, fontWeight: "600" },
  tituloGrupo: { fontSize: 19, fontWeight: "700", color: "#2B2820", flexShrink: 1, flex: 1 },
  cabecalhoGrupoAcoes: { flexDirection: "row", gap: 14 },

  conteudoScroll: { paddingHorizontal: 20, paddingBottom: 100, gap: 18 },

  resumoCaixa: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: "#EAE2CF",
    gap: 8
  },
  resumoTitulo: { fontSize: 14, fontWeight: "700", color: "#5C5745", marginBottom: 2 },
  resumoTudoOk: { fontSize: 15, color: "#3F6B4F", fontWeight: "600" },
  resumoLinha: { paddingVertical: 2 },
  resumoTexto: { fontSize: 14.5, color: "#2B2820", lineHeight: 21 },
  resumoNome: { fontWeight: "700" },
  resumoValor: { fontWeight: "700", color: "#A83B32" },

  seccao: { gap: 10 },
  seccaoCabecalho: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
  },
  seccaoTitulo: { fontSize: 16, fontWeight: "700", color: "#2B2820" },
  seccaoAcao: { fontSize: 13.5, fontWeight: "700", color: "#3F6B4F" },

  chipsLinha: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chipPessoa: {
    backgroundColor: "#EFEADC",
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 7
  },
  chipPessoaTexto: { fontSize: 13.5, color: "#2B2820", fontWeight: "600" },

  chipSelecionavel: {
    backgroundColor: "#EFEADC",
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: "#EFEADC"
  },
  chipSelecionado: { backgroundColor: "#3F6B4F", borderColor: "#3F6B4F" },
  chipSelecionavelTexto: { fontSize: 13.5, color: "#2B2820", fontWeight: "600" },
  chipSelecionadoTexto: { color: "#FFFFFF" },

  itemDespesa: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: "#EAE2CF",
    gap: 6
  },
  itemDespesaTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10
  },
  itemDespesaDescricao: { fontSize: 15, fontWeight: "700", color: "#2B2820", flexShrink: 1 },
  itemDespesaValor: { fontSize: 15, fontWeight: "700", color: "#2B2820" },
  itemDespesaBaixo: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
  },
  itemDespesaDetalhe: { fontSize: 12.5, color: "#8A8270" },
  itemDespesaAcoes: { flexDirection: "row", gap: 14 },
  itemDespesaBotao: { padding: 4 },
  itemDespesaBotaoTexto: { fontSize: 12.5, fontWeight: "700", color: "#3F6B4F" },
  itemDespesaBotaoApagar: { color: "#A83B32" },

  modalFundo: {
    flex: 1,
    backgroundColor: "rgba(43,40,32,0.4)",
    justifyContent: "flex-end"
  },
  modalCaixa: {
    backgroundColor: "#F7F3EA",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 30,
    gap: 12
  },
  modalCaixaGrande: {
    backgroundColor: "#F7F3EA",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 30,
    maxHeight: "88%"
  },
  modalTitulo: { fontSize: 18, fontWeight: "700", color: "#2B2820", marginBottom: 8 },
  rotulo: { fontSize: 12.5, fontWeight: "700", color: "#5C5745", marginTop: 12, marginBottom: 6 },

  input: {
    backgroundColor: "#FFFFFF",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E4DCC8",
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: "#2B2820"
  },
  inputPequeno: {
    backgroundColor: "#FFFFFF",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E4DCC8",
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
    color: "#2B2820",
    width: 90,
    textAlign: "right"
  },

  segmentado: {
    flexDirection: "row",
    backgroundColor: "#EFEADC",
    borderRadius: 10,
    padding: 3,
    gap: 3
  },
  segmentadoBotao: {
    flex: 1,
    paddingVertical: 9,
    alignItems: "center",
    borderRadius: 8
  },
  segmentadoBotaoAtivo: { backgroundColor: "#FFFFFF" },
  segmentadoBotaoTexto: { fontSize: 13, fontWeight: "700", color: "#8A8270" },
  segmentadoBotaoTextoAtivo: { color: "#2B2820" },

  linhaParticipante: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 7
  },
  linhaParticipanteNome: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1 },
  linhaParticipanteTexto: { fontSize: 14.5, color: "#2B2820", fontWeight: "600" },
  caixaSelecao: {
    width: 20,
    height: 20,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: "#B7AE97",
    alignItems: "center",
    justifyContent: "center"
  },
  caixaSelecaoAtiva: { backgroundColor: "#3F6B4F", borderColor: "#3F6B4F" },
  caixaSelecaoMarca: { color: "#FFFFFF", fontSize: 12, fontWeight: "700" },

  textoAjudaSoma: { fontSize: 12, color: "#8A8270", marginTop: 8 },

  modalBotoes: { flexDirection: "row", gap: 10, marginTop: 20 },
  modalBotaoSecundario: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 10,
    alignItems: "center",
    backgroundColor: "#EFEADC"
  },
  modalBotaoSecundarioTexto: { fontWeight: "700", color: "#5C5745" },
  modalBotaoPrimario: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 10,
    alignItems: "center",
    backgroundColor: "#3F6B4F"
  },
  modalBotaoPrimarioTexto: { fontWeight: "700", color: "#FFFFFF" }
});