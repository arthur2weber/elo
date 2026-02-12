# 08 — Contribuindo para a documentação (regras e contrato)

Objetivo: manter a documentação fiel ao que o código faz.

Regras de ouro

1. Documente com base no código, não nos comentários.
   - Antes de editar um doc, abra os arquivos relevantes e valide o comportamento (procure `console.log`, retornos e tratamento de erros), inclua trechos que comprovem o comportamento.

2. Sempre atualize `docs/_scan.json` quando adicionar/remover módulos.

3. Ao alterar prompts ou KB, adicione uma nota em `06-ai.md` explicando o motivo e o teste que valida a mudança.

4. Testes de documentação:
   - Inclua um exemplo mínimo reproduzível (ex: um `curl` para o endpoint testado) quando documentar endpoints ou fluxos.
   - Para mudanças em drivers, inclua um exemplo do JSON resultante e um log que prove que o driver foi executado com sucesso.

Como revisar PRs de docs
- Verifique se a documentação reflete o comportamento atual (rodar localmente o fluxo descrito, ou checar os logs para confirmar).
- Execute `docs/verify_docs.sh` (script incluído) para garantir que arquivos essenciais existem.

Boilerplate de commit para docs
- Prefixo: `docs:`
- Mensagem: curto resumo; corpo: arquivos verificados + comando usado para testar.

Processo para documentar um bug fix
1. Identifique o commit que alterou o comportamento.
2. Rode a versão antes/depois (se possível) e capture logs mínimos.
3. Descreva a correção e inclua o trecho de log que prova a diferença.

Nota final
- Priorize clareza e evidência: explique o que o sistema faz e inclua onde no código esse comportamento é implementado (arquivo + função + linhas aproximadas).
