using System.Net.Http.Headers;

namespace Oasi.Api.Infrastructure;

/// <summary>
/// Archiviazione file. I percorsi sono sempre "tenants/{tenantId}/…": il
/// controllo di accesso avviene nell'API, mai con URL pubblici.
/// </summary>
public interface IFileStorage
{
    Task PutAsync(string path, Stream content, string contentType, CancellationToken ct = default);
    Task<Stream?> GetAsync(string path, CancellationToken ct = default);
    Task DeleteAsync(string path, CancellationToken ct = default);
}

/// <summary>Disco locale: sviluppo e test.</summary>
public sealed class LocalFileStorage(IConfiguration config) : IFileStorage
{
    private readonly string _root = Path.GetFullPath(config["Storage:LocalRoot"] ?? Path.Combine(Path.GetTempPath(), "oasi-storage"));

    private string Resolve(string path)
    {
        var full = Path.GetFullPath(Path.Combine(_root, path));
        if (!full.StartsWith(_root + Path.DirectorySeparatorChar, StringComparison.Ordinal)) throw new InvalidOperationException("Percorso non valido");
        return full;
    }

    public async Task PutAsync(string path, Stream content, string contentType, CancellationToken ct = default)
    {
        var full = Resolve(path);
        Directory.CreateDirectory(Path.GetDirectoryName(full)!);
        await using var f = File.Create(full);
        await content.CopyToAsync(f, ct);
    }

    public Task<Stream?> GetAsync(string path, CancellationToken ct = default)
    {
        var full = Resolve(path);
        return Task.FromResult<Stream?>(File.Exists(full) ? File.OpenRead(full) : null);
    }

    public Task DeleteAsync(string path, CancellationToken ct = default)
    {
        var full = Resolve(path);
        if (File.Exists(full)) File.Delete(full);
        return Task.CompletedTask;
    }
}

/// <summary>
/// Supabase Storage (bucket privato) tramite API REST con la chiave di servizio,
/// usata solo lato server. Non ancora verificata contro un progetto reale.
/// </summary>
public sealed class SupabaseFileStorage(HttpClient http, IConfiguration config) : IFileStorage
{
    private string Url(string path) => $"{config["Storage:SupabaseUrl"]!.TrimEnd('/')}/storage/v1/object/{config["Storage:Bucket"] ?? "oasi-private"}/{path}";

    private HttpRequestMessage Request(HttpMethod method, string path)
    {
        var req = new HttpRequestMessage(method, Url(path));
        req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", config["Storage:ServiceKey"]);
        return req;
    }

    public async Task PutAsync(string path, Stream content, string contentType, CancellationToken ct = default)
    {
        using var req = Request(HttpMethod.Post, path);
        req.Headers.Add("x-upsert", "true");
        req.Content = new StreamContent(content);
        req.Content.Headers.ContentType = new MediaTypeHeaderValue(contentType);
        using var res = await http.SendAsync(req, ct);
        res.EnsureSuccessStatusCode();
    }

    public async Task<Stream?> GetAsync(string path, CancellationToken ct = default)
    {
        var res = await http.SendAsync(Request(HttpMethod.Get, path), HttpCompletionOption.ResponseHeadersRead, ct);
        if (res.StatusCode == System.Net.HttpStatusCode.NotFound) return null;
        res.EnsureSuccessStatusCode();
        return await res.Content.ReadAsStreamAsync(ct);
    }

    public async Task DeleteAsync(string path, CancellationToken ct = default)
    {
        using var res = await http.SendAsync(Request(HttpMethod.Delete, path), ct);
    }
}
