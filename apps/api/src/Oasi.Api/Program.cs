using System.Text;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.IdentityModel.Tokens;
using Npgsql;
using Oasi.Api.Features;
using Oasi.Api.Features.Platform;
using Oasi.Api.Infrastructure;
using Oasi.Api.Notifications;
using Oasi.Api.Tenancy;

var builder = WebApplication.CreateBuilder(args);
var config = builder.Configuration;

// ── Database: un'unica connessione condivisa, ruolo oasi_api senza BYPASSRLS ──
builder.Services.AddSingleton(sp => NpgsqlDataSource.Create(
    sp.GetRequiredService<IConfiguration>().GetConnectionString("Oasi") is { Length: > 0 } cs
        ? cs : throw new InvalidOperationException("Configura ConnectionStrings:Oasi (variabile ConnectionStrings__Oasi).")));
builder.Services.AddSingleton<Db>();
builder.Services.AddMemoryCache();
builder.Services.AddHttpClient<IEmailSender, ResendEmailSender>();
builder.Services.AddSingleton<DomainAllowList>();

// ── Autenticazione: token emessi da Supabase Auth ──
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme).AddJwtBearer(options =>
{
    var supabaseUrl = config["Auth:SupabaseUrl"]?.TrimEnd('/');
    var secret = config["Auth:JwtSecret"];
    options.MapInboundClaims = false;
    options.TokenValidationParameters = new TokenValidationParameters
    {
        ValidateIssuer = supabaseUrl is not null,
        ValidIssuer = supabaseUrl is null ? null : $"{supabaseUrl}/auth/v1",
        ValidateAudience = true,
        ValidAudience = config["Auth:Audience"] ?? "authenticated",
        ValidateLifetime = true,
        ClockSkew = TimeSpan.FromSeconds(30),
        NameClaimType = "sub",
    };
    if (!string.IsNullOrEmpty(secret))
    {
        // Chiave simmetrica (legacy JWT secret di Supabase, usata anche nei test)
        options.TokenValidationParameters.IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(secret));
    }
    else if (supabaseUrl is not null)
    {
        // Chiavi asimmetriche pubblicate da Supabase (JWKS)
        options.Authority = $"{supabaseUrl}/auth/v1";
        options.MetadataAddress = $"{supabaseUrl}/auth/v1/.well-known/openid-configuration";
    }
    else throw new InvalidOperationException("Configura Auth:SupabaseUrl oppure Auth:JwtSecret.");
});
builder.Services.AddAuthorization();

// ── CORS: solo domini registrati delle palestre (+ origini di sviluppo) ──
builder.Services.AddCors(o => o.AddDefaultPolicy(p => p
    .SetIsOriginAllowed(origin => DomainAllowList.Instance?.IsAllowed(origin) ?? false)
    .AllowAnyHeader().AllowAnyMethod().WithExposedHeaders("Location")));

builder.Services.ConfigureHttpJsonOptions(o => o.SerializerOptions.PropertyNamingPolicy = System.Text.Json.JsonNamingPolicy.CamelCase);

var app = builder.Build();
app.Services.GetRequiredService<DomainAllowList>();

app.UseApiErrors();
app.UseCors();
app.UseMiddleware<TenantResolutionMiddleware>();
app.UseAuthentication();
app.UseAuthorization();

app.MapGet("/health", () => Results.Ok(new { status = "ok" }));
PublicConfigEndpoints.Map(app);
MeEndpoints.Map(app);
ClassEndpoints.Map(app);
CalendarEndpoints.Map(app);
EnrollmentEndpoints.Map(app);
MakeupEndpoints.Map(app);
FigureEndpoints.Map(app);
EventEndpoints.Map(app);
InvitationEndpoints.Map(app);
PlatformEndpoints.Map(app);

app.Run();

public partial class Program;
