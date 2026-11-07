using System.Net.Http.Json;

namespace Oasi.Api.Notifications;

public interface IEmailSender
{
    Task SendAsync(string to, string subject, string html, string? fromName = null, CancellationToken ct = default);
}

/// <summary>
/// Invio email tramite Resend (https://resend.com). Se la chiave non è
/// configurata (sviluppo) il messaggio viene solo scritto nel log.
/// </summary>
public sealed class ResendEmailSender(HttpClient http, IConfiguration config, ILogger<ResendEmailSender> log) : IEmailSender
{
    public async Task SendAsync(string to, string subject, string html, string? fromName = null, CancellationToken ct = default)
    {
        var apiKey = config["Email:ResendApiKey"];
        var fromAddress = config["Email:From"] ?? "notifiche@example.com";
        if (string.IsNullOrWhiteSpace(apiKey))
        {
            log.LogWarning("Email non inviata (Resend non configurato) a {To}: {Subject}", to, subject);
            return;
        }
        using var req = new HttpRequestMessage(HttpMethod.Post, "https://api.resend.com/emails");
        req.Headers.Authorization = new("Bearer", apiKey);
        req.Content = JsonContent.Create(new { from = fromName is null ? fromAddress : $"{fromName} <{fromAddress}>", to = new[] { to }, subject, html });
        using var res = await http.SendAsync(req, ct);
        if (!res.IsSuccessStatusCode)
            log.LogError("Invio email fallito ({Status}) verso {To}", (int)res.StatusCode, to);
    }
}
