using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ZimMarketplace.API.Migrations
{
    /// <inheritdoc />
    public partial class AddPaymentEscrowTracking : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "EscrowStatus",
                table: "Listings",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "PaymentTransactionId",
                table: "Listings",
                type: "text",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "EscrowStatus",
                table: "Listings");

            migrationBuilder.DropColumn(
                name: "PaymentTransactionId",
                table: "Listings");
        }
    }
}
