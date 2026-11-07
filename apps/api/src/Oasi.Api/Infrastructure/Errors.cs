namespace Oasi.Api.Infrastructure;

/// <summary>Errori applicativi tradotti in risposte HTTP problem+json.</summary>
public class ApiException(int status, string code, string message) : Exception(message)
{
    public int Status { get; } = status;
    public string Code { get; } = code;

    public static ApiException NotFound(string what = "Risorsa") => new(404, "not_found", $"{what} non trovata.");
    public static ApiException Forbidden(string message = "Non hai i permessi per questa operazione.") => new(403, "forbidden", message);
    public static ApiException Conflict(string code, string message) => new(409, code, message);
    public static ApiException Invalid(string message) => new(400, "invalid_request", message);
}

public static class ErrorHandling
{
    public static IApplicationBuilder UseApiErrors(this IApplicationBuilder app) => app.Use(async (ctx, next) =>
    {
        try
        {
            await next();
        }
        catch (ApiException ex) when (!ctx.Response.HasStarted)
        {
            ctx.Response.StatusCode = ex.Status;
            await ctx.Response.WriteAsJsonAsync(new { type = ex.Code, title = ex.Message, status = ex.Status },
                options: null, contentType: "application/problem+json");
        }
        catch (Npgsql.PostgresException ex) when (!ctx.Response.HasStarted && ex.SqlState is "23503" or "23505" or "23514" or "42501")
        {
            // Violazioni di vincoli o di RLS: non esporre dettagli interni
            var (status, code) = ex.SqlState switch
            {
                "23505" => (409, "duplicate"),
                "42501" => (403, "forbidden"),
                _ => (400, "constraint_violation"),
            };
            ctx.Response.StatusCode = status;
            await ctx.Response.WriteAsJsonAsync(new { type = code, title = "Operazione non consentita dai vincoli dei dati.", status },
                options: null, contentType: "application/problem+json");
        }
    });
}
