using System.Diagnostics;
using System.Net.Http.Headers;
using System.Security.Cryptography;
using System.Text;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Configuration;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Tokens;
using Npgsql;

namespace Oasi.Api.Tests;

/// <summary>
/// Avvia l'API contro un database PostgreSQL reale ricreato da zero con
/// migrazioni e seed (db/local/reset.sh). Variabili: PGHOST, PGPORT (default /tmp, 5433).
/// </summary>
public sealed class ApiFixture : WebApplicationFactory<Program>, IAsyncLifetime
{
    public const string JwtSecret = "chiave-di-test-solo-per-integrazione-1234567890";
    public const string Database = "oasi_test";
    private static readonly string PgHost = Environment.GetEnvironmentVariable("PGHOST") ?? "/tmp";
    private static readonly string PgPort = Environment.GetEnvironmentVariable("PGPORT") ?? "5433";

    public string AdminConnectionString => $"Host={PgHost};Port={PgPort};Database={Database};Username=postgres;Password={Environment.GetEnvironmentVariable("PGPASSWORD") ?? ""}";

    public Task InitializeAsync()
    {
        var root = FindRepoRoot();
        var psi = new ProcessStartInfo("bash", [Path.Combine(root, "db/local/reset.sh"), "--seed"]) { RedirectStandardOutput = true, RedirectStandardError = true };
        psi.Environment["PGHOST"] = PgHost;
        psi.Environment["PGPORT"] = PgPort;
        psi.Environment["OASI_DB"] = Database;
        using var p = Process.Start(psi)!;
        var err = p.StandardError.ReadToEnd();
        p.WaitForExit();
        if (p.ExitCode != 0) throw new InvalidOperationException("Reset del database fallito: " + err);
        return Task.CompletedTask;
    }

    Task IAsyncLifetime.DisposeAsync() => Task.CompletedTask;

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Development");
        builder.ConfigureAppConfiguration(c => c.AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["ConnectionStrings:Oasi"] = $"Host={PgHost};Port={PgPort};Database={Database};Username=oasi_api;Password=oasi_api_local",
            ["Auth:JwtSecret"] = JwtSecret,
            ["Auth:SupabaseUrl"] = null,
        }));
    }

    /// <summary>Client HTTP che si presenta come la Web App di un dominio, con il token di un utente.</summary>
    public HttpClient For(string host, Guid? userId = null)
    {
        var client = CreateClient();
        client.DefaultRequestHeaders.Add("Origin", $"https://{host}");
        if (userId is { } id) client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", Token(id));
        return client;
    }

    public static string Token(Guid userId)
    {
        var creds = new SigningCredentials(new SymmetricSecurityKey(Encoding.UTF8.GetBytes(JwtSecret)), SecurityAlgorithms.HmacSha256);
        return new JsonWebTokenHandler().CreateToken(new SecurityTokenDescriptor
        {
            Audience = "authenticated",
            Claims = new Dictionary<string, object> { ["sub"] = userId.ToString(), ["role"] = "authenticated" },
            Expires = DateTime.UtcNow.AddMinutes(10),
            SigningCredentials = creds,
        });
    }

    /// <summary>Stessi UUID deterministici di apps/web/scripts/export-demo-seed.ts</summary>
    public static Guid Id(string key)
    {
        var h = Convert.ToHexString(SHA1.HashData(Encoding.UTF8.GetBytes($"oasi-aerial:{key}"))).ToLowerInvariant();
        var variant = ((Convert.ToInt32(h.Substring(16, 2), 16) & 0x3f) | 0x80).ToString("x2");
        return Guid.Parse($"{h[..8]}-{h.Substring(8, 4)}-5{h.Substring(13, 3)}-{variant}{h.Substring(18, 2)}-{h.Substring(20, 12)}");
    }

    public async Task Sql(string sql, object? args = null)
    {
        await using var conn = new NpgsqlConnection(AdminConnectionString);
        await conn.OpenAsync();
        await using var cmd = new NpgsqlCommand(sql, conn);
        if (args is not null)
            foreach (var prop in args.GetType().GetProperties()) cmd.Parameters.AddWithValue(prop.Name, prop.GetValue(args)!);
        await cmd.ExecuteNonQueryAsync();
    }

    public async Task<T?> Scalar<T>(string sql, object? args = null)
    {
        await using var conn = new NpgsqlConnection(AdminConnectionString);
        await conn.OpenAsync();
        await using var cmd = new NpgsqlCommand(sql, conn);
        if (args is not null)
            foreach (var prop in args.GetType().GetProperties()) cmd.Parameters.AddWithValue(prop.Name, prop.GetValue(args)!);
        var v = await cmd.ExecuteScalarAsync();
        return v is null or DBNull ? default : (T)v;
    }

    private static string FindRepoRoot()
    {
        var dir = new DirectoryInfo(AppContext.BaseDirectory);
        while (dir is not null && !Directory.Exists(Path.Combine(dir.FullName, "db", "migrations"))) dir = dir.Parent;
        return dir?.FullName ?? throw new DirectoryNotFoundException("Cartella db/migrations non trovata");
    }
}

[CollectionDefinition("api")]
public sealed class ApiCollection : ICollectionFixture<ApiFixture>;

/// <summary>Persone e domini dei seed demo.</summary>
public static class Seed
{
    public const string OasiHost = "oasi.localhost";
    public const string ProvaHost = "prova.localhost";
    public static readonly Guid Giulia = ApiFixture.Id("user:stu-giulia");
    public static readonly Guid GiuliaMember = ApiFixture.Id("oasi:member:stu-giulia");
    public static readonly Guid Sofia = ApiFixture.Id("user:stu-sofia");
    public static readonly Guid Chiara = ApiFixture.Id("user:tch-chiara");     // insegnante cerchio
    public static readonly Guid Elena = ApiFixture.Id("user:tch-elena");       // insegnante tessuti
    public static readonly Guid OasiAdmin = ApiFixture.Id("user:oasi-admin");
    public static readonly Guid ProvaTeacher = ApiFixture.Id("user:prova-teacher");
    public static readonly Guid Laura = ApiFixture.Id("user:prova-student");   // allieva e genitore a Studio Prova
    public static readonly Guid ChildMember = ApiFixture.Id("prova:member:s2");
    public static readonly Guid ClassCerchioInt = ApiFixture.Id("oasi:class:cls-cerchio-int");
    public static readonly Guid ClassTessutiInt = ApiFixture.Id("oasi:class:cls-tessuti-int");
    public static readonly Guid ClassCerchioBase = ApiFixture.Id("oasi:class:cls-cerchio-base");
    public static readonly Guid ProvaClass = ApiFixture.Id("prova:class:pole-base");
}
