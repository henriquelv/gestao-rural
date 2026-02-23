# Setup Android Studio - Gestão Rural

## Pré-requisitos
- Android Studio instalado
- JDK 11+ instalado
- SDK Android API 33+ instalado

## Como abrir no Android Studio

1. **Abra o Android Studio**

2. **File → Open** e selecione a pasta `android/` do projeto:
   ```
   c:\Users\clebe\Downloads\gestao-rural-final\android
   ```

3. **Aguarde o Gradle sincronizar** (pode levar alguns minutos na primeira vez)

4. **Build e Run:**
   - Conecte um dispositivo Android USB ou use um emulador
   - Clique em "Run" ou pressione `Shift + F10`
   - Selecione o dispositivo/emulador

## Informações do Projeto

- **App Name:** Gestão Rural
- **Package:** com.gestao.rural
- **Min SDK:** API 23
- **Target SDK:** API 34
- **Gradle Version:** 8.1.1

## Solução de Problemas

### Gradle não sincroniza
- File → Sync Now
- Ou via terminal: `./gradlew clean build`

### Erro de SDK não encontrado
- File → Project Structure → SDK Location
- Configure o caminho do seu Android SDK (geralmente em `C:\Users\[seu-user]\AppData\Local\Android\Sdk`)

### Build falha
- Limpar cache: `./gradlew clean`
- Rebuildar: `./gradlew build`

## Arquivos importantes

- `android/app/build.gradle` - Configurações do app
- `android/build.gradle` - Configurações do projeto
- `android/local.properties` - Caminho local do SDK (gerado automaticamente)

---

**Última atualização:** 2025-02-04
**Status:** ✅ Pronto para compilar e rodar
