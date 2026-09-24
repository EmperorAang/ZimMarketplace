using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ZimMarketplace.API.Migrations
{
    /// <inheritdoc />
    public partial class AddExchangeRates : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "ExchangeRates",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    BaseCurrency = table.Column<string>(type: "character varying(3)", maxLength: 3, nullable: false),
                    QuoteCurrency = table.Column<string>(type: "character varying(3)", maxLength: 3, nullable: false),
                    Rate = table.Column<decimal>(type: "numeric", nullable: false),
                    EffectiveAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ExchangeRates", x => x.Id);
                });

            migrationBuilder.InsertData(
                table: "ExchangeRates",
                columns: new[] { "Id", "BaseCurrency", "EffectiveAt", "QuoteCurrency", "Rate" },
                values: new object[] { new Guid("11111111-1111-1111-1111-111111111111"), "USD", new DateTime(2026, 9, 9, 0, 0, 0, 0, DateTimeKind.Utc), "ZiG", 25.5m });

            migrationBuilder.CreateIndex(
                name: "IX_ExchangeRates_BaseCurrency_QuoteCurrency_EffectiveAt",
                table: "ExchangeRates",
                columns: new[] { "BaseCurrency", "QuoteCurrency", "EffectiveAt" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "ExchangeRates");
        }
    }
}
