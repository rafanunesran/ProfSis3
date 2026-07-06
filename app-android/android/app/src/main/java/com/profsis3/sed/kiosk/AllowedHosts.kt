package com.profsis3.sed.kiosk

/**
 * Fonte unica dos dominios permitidos, espelhando extensao-profsis/manifest.json
 * (host_permissions / content_scripts matches).
 */
object AllowedHosts {

    /** Portal Sala do Futuro (SED) - onde o content_sed.js roda. */
    val SED_HOSTS = listOf(
        "saladofuturoprofessor.educacao.sp.gov.br",
        "saladofuturo.educacao.sp.gov.br",
        ".educacao.sp.gov.br",
    )

    /**
     * Dominios do SSO gov.br usados no login do SED.
     *
     * O manifest.json da extensao Chrome nao precisa listar isso (o browser do
     * usuario ja lida com qualquer redirect de login). Aqui, como o WebView e
     * restrito por whitelist, o fluxo de login PRECISA que esses dominios estejam
     * liberados. Confirmado com captura real de um login (URL observada:
     * "https://sso.acesso.gov.br/login?client_id=idp.sp.gov.br&authorization_id=...")
     * - "sso.acesso.gov.br" cai dentro do padrao ".acesso.gov.br" abaixo.
     */
    val LOGIN_HOSTS = listOf(
        "acesso.gov.br",
        ".acesso.gov.br",
        "sso.acesso.gov.br",
    )

    /** App web ProfSis (Firebase) - onde o content_profsis.js roda. */
    val PROFSIS_HOSTS = listOf(
        "localhost",
        "127.0.0.1",
        ".firebaseapp.com",
        ".profsis3.com",
        ".web.app",
        ".github.io",
    )

    /**
     * @param pattern comeca com "." para casar o dominio e qualquer subdominio
     * (ex: ".educacao.sp.gov.br" casa "saladofuturo.educacao.sp.gov.br" e
     * "educacao.sp.gov.br"); sem "." exige igualdade exata.
     */
    fun isAllowed(host: String, patterns: List<String>): Boolean {
        val normalizedHost = host.lowercase()
        return patterns.any { pattern ->
            if (pattern.startsWith(".")) {
                normalizedHost.endsWith(pattern) || normalizedHost == pattern.substring(1)
            } else {
                normalizedHost == pattern
            }
        }
    }
}
